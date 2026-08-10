// Theme provider + hooks (§4.1). Switching writes the `theme` row in `setting`
// (§2.3) and the provider re-renders — instant, no animation, applies
// everywhere at once (§4.1). Every component reads colour through `useTheme()`;
// there is no static colour import anywhere else in the app (§15).
//
// The provider resolves the active theme from a merged registry: the built-in
// `themes` record plus any user-authored custom themes loaded from the DB. A
// custom theme is a plain `Theme` (see customTheme.ts), so everything
// downstream is identical whether the active theme shipped with the app or was
// made in the creator.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { getSetting } from '../settings/getSetting';
import { setSetting } from '../settings/setSetting';
import { nextBoundaryMs, themeIdForTime } from './autoThemeSchedule';
import { buildCustomTheme } from './customTheme';
import { deriveVisuals, type VisualTokens } from './deriveVisuals';
import { loadCustomThemeDefs } from './themeStorage';
import { fonts, fontSize, radius, spacing, type Fonts, type FontSize, type Radius, type Spacing } from './tokens';
import { DEFAULT_THEME_ID, themes, type Theme } from './themes';

export const THEME_SETTING_KEY = 'theme';

// §A1 automatic day/night settings.
export const AUTO_THEME_ENABLED_KEY = 'auto_theme_enabled';
export const THEME_DAY_ID_KEY = 'theme_day_id';
export const THEME_NIGHT_ID_KEY = 'theme_night_id';
export const THEME_DAY_TIME_KEY = 'theme_day_time';
export const THEME_NIGHT_TIME_KEY = 'theme_night_time';
export const DEFAULT_DAY_TIME = '08:00';
export const DEFAULT_NIGHT_TIME = '18:00';

export interface AutoThemeConfig {
  enabled: boolean;
  dayId: string;
  /** Empty until the user picks a night theme — the feature is inert until set. */
  nightId: string;
  dayTime: string;
  nightTime: string;
}

function defaultAutoConfig(): AutoThemeConfig {
  return { enabled: false, dayId: DEFAULT_THEME_ID, nightId: '', dayTime: DEFAULT_DAY_TIME, nightTime: DEFAULT_NIGHT_TIME };
}

// What components actually consume: the active theme's colour/category/mode
// data merged with the shared, non-themed type & layout tokens. The shape is
// deliberately the same one the codebase already used (`theme.colors.x`,
// `theme.spacing.y`, …) so migrating a consumer is a source change, not a
// rewrite.
export interface AppTheme {
  id: string;
  name: string;
  mode: Theme['mode'];
  colors: Theme['colors'];
  categoryColors: Theme['categoryColors'];
  tabBarBg: string;
  fonts: Fonts;
  fontSize: FontSize;
  spacing: Spacing;
  radius: Radius;
  // The derived visual layer (redesign R2) — computed once, here, from the
  // colours above. Components read these instead of writing their own shadow
  // props or gradient stops.
  elevation: VisualTokens['elevation'];
  gradients: VisualTokens['gradients'];
  glow: VisualTokens['glow'];
  onPhoto: VisualTokens['onPhoto'];
}

function composeAppTheme(t: Theme): AppTheme {
  const visuals = deriveVisuals(t.colors, t.mode);
  return {
    id: t.id,
    name: t.name,
    mode: t.mode,
    colors: t.colors,
    categoryColors: t.categoryColors,
    tabBarBg: t.tabBarBg,
    fonts,
    fontSize,
    spacing,
    radius,
    ...visuals,
  };
}

// Resolve an id to a concrete Theme from the merged registry. An unknown id
// (e.g. a custom theme that was deleted, or one whose defs haven't loaded yet)
// degrades to the default rather than throwing.
function resolveTheme(id: string, custom: Record<string, Theme>): Theme {
  return (themes as Record<string, Theme>)[id] ?? custom[id] ?? themes[DEFAULT_THEME_ID];
}

interface ThemeContextValue {
  theme: AppTheme;
  themeId: string;
  setTheme: (id: string) => Promise<void>;
  // The user-authored themes, keyed by id — merged into resolution above and
  // read directly by the picker/creator so they render live.
  customThemes: Record<string, Theme>;
  // Re-read custom themes from the DB after the creator saves/deletes one.
  refreshCustomThemes: () => Promise<void>;
  // §A1 automatic day/night config + a setter the picker uses to update it.
  autoTheme: AutoThemeConfig;
  setAutoTheme: (config: AutoThemeConfig) => Promise<void>;
}

// Default context = Hearth with a no-op setter. A component rendered without a
// provider (e.g. an isolated snapshot test) still gets a complete, valid theme
// rather than throwing — the provider only ever *overrides* this default.
const ThemeContext = createContext<ThemeContextValue>({
  theme: composeAppTheme(themes[DEFAULT_THEME_ID]),
  themeId: DEFAULT_THEME_ID,
  setTheme: async () => {},
  customThemes: {},
  refreshCustomThemes: async () => {},
  autoTheme: defaultAutoConfig(),
  setAutoTheme: async () => {},
});

interface ThemeProviderProps {
  db?: DbClient;
  children: ReactNode;
  // Forces a specific theme id for this subtree regardless of the persisted
  // setting — used by the picker's live preview of an existing theme (§4.10
  // step 2). When set, the provider is display-only and never writes.
  overrideThemeId?: string;
  // Forces a full, possibly-unsaved Theme object — used by the creator's
  // preview, where the theme has no registry id yet. Wins over everything.
  overrideTheme?: Theme;
}

export function ThemeProvider({ db, children, overrideThemeId, overrideTheme }: ThemeProviderProps) {
  const [storedThemeId, setStoredThemeId] = useState<string>(DEFAULT_THEME_ID);
  const [customThemes, setCustomThemes] = useState<Record<string, Theme>>({});
  const [autoTheme, setAutoThemeState] = useState<AutoThemeConfig>(defaultAutoConfig);

  const refreshCustomThemes = useCallback(async () => {
    if (!db) return;
    try {
      const defs = await loadCustomThemeDefs(db);
      const map: Record<string, Theme> = {};
      for (const def of defs) {
        try {
          map[def.id] = buildCustomTheme(def);
        } catch (error) {
          logger.warn('ui', 'Skipping unbuildable custom theme', { id: def.id, error: String(error) });
        }
      }
      setCustomThemes(map);
    } catch (error) {
      logger.warn('ui', 'Failed to load custom themes', { error: String(error) });
    }
  }, [db]);

  // Load custom themes once (and whenever db changes). A preview subtree passes
  // no db and simply inherits none — it only ever shows the overridden theme.
  useEffect(() => {
    if (overrideTheme) return;
    void refreshCustomThemes();
  }, [refreshCustomThemes, overrideTheme]);

  // Load the persisted choice once on mount. The raw value is kept even if it's
  // a custom id whose defs haven't loaded yet — resolveTheme falls back to the
  // default until they do, then re-resolves automatically (§4.1).
  useEffect(() => {
    if (!db || overrideThemeId || overrideTheme) return;
    let cancelled = false;
    getSetting(db, THEME_SETTING_KEY)
      .then((value) => {
        if (cancelled) return;
        if (value) setStoredThemeId(value);
      })
      .catch((error) => logger.warn('ui', 'Failed to load theme setting', { error: String(error) }));
    return () => {
      cancelled = true;
    };
  }, [db, overrideThemeId, overrideTheme]);

  const setTheme = useCallback(
    async (id: string) => {
      setStoredThemeId(id); // optimistic — the switch must feel instant (§4.1)
      if (db) {
        try {
          await setSetting(db, THEME_SETTING_KEY, id);
          logger.info('ui', 'Theme changed', { theme: id });
        } catch (error) {
          logger.error('ui', 'Failed to persist theme', { theme: id, error: String(error) });
        }
      }
    },
    [db],
  );

  // §A1: keep the latest stored id in a ref so timer/AppState callbacks compare
  // against the current value, not the one captured when the timer was armed.
  const storedRef = useRef(storedThemeId);
  storedRef.current = storedThemeId;

  // Load the persisted auto-theme config on mount.
  useEffect(() => {
    if (!db || overrideTheme || overrideThemeId) return;
    let cancelled = false;
    (async () => {
      try {
        const [enabled, dayId, nightId, dayTime, nightTime] = await Promise.all([
          getSetting(db, AUTO_THEME_ENABLED_KEY),
          getSetting(db, THEME_DAY_ID_KEY),
          getSetting(db, THEME_NIGHT_ID_KEY),
          getSetting(db, THEME_DAY_TIME_KEY),
          getSetting(db, THEME_NIGHT_TIME_KEY),
        ]);
        if (cancelled) return;
        setAutoThemeState({
          enabled: enabled === '1',
          dayId: dayId || DEFAULT_THEME_ID,
          nightId: nightId || '',
          dayTime: dayTime || DEFAULT_DAY_TIME,
          nightTime: nightTime || DEFAULT_NIGHT_TIME,
        });
      } catch (error) {
        logger.warn('ui', 'Failed to load auto-theme settings', { error: String(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, overrideTheme, overrideThemeId]);

  const setAutoTheme = useCallback(
    async (config: AutoThemeConfig) => {
      setAutoThemeState(config);
      if (!db) return;
      try {
        await setSetting(db, AUTO_THEME_ENABLED_KEY, config.enabled ? '1' : '0');
        await setSetting(db, THEME_DAY_ID_KEY, config.dayId);
        await setSetting(db, THEME_NIGHT_ID_KEY, config.nightId);
        await setSetting(db, THEME_DAY_TIME_KEY, config.dayTime);
        await setSetting(db, THEME_NIGHT_TIME_KEY, config.nightTime);
      } catch (error) {
        logger.error('ui', 'Failed to persist auto-theme settings', { error: String(error) });
      }
    },
    [db],
  );

  // Compute the scheduled theme for "now" and apply it if it differs. Never
  // fights an active preview (override*), and never runs when auto is off or no
  // night theme has been chosen (feature inert until set — §A1).
  const applyScheduledTheme = useCallback(() => {
    if (overrideThemeId || overrideTheme) return;
    if (!autoTheme.enabled || !autoTheme.nightId || !autoTheme.dayId) return;
    const target = themeIdForTime(new Date(), autoTheme.dayTime, autoTheme.nightTime, autoTheme.dayId, autoTheme.nightId);
    if (storedRef.current !== target) void setTheme(target);
  }, [autoTheme, overrideThemeId, overrideTheme, setTheme]);

  // Apply on mount/config-change, re-arm a timer for the next boundary, and
  // re-apply whenever the app returns to the foreground.
  useEffect(() => {
    if (overrideThemeId || overrideTheme) return;
    if (!autoTheme.enabled || !autoTheme.nightId) return;
    applyScheduledTheme();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      const ms = nextBoundaryMs(new Date(), autoTheme.dayTime, autoTheme.nightTime);
      timer = setTimeout(() => {
        applyScheduledTheme();
        arm();
      }, ms + 500);
    };
    arm();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') applyScheduledTheme();
    });
    return () => {
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, [autoTheme, applyScheduledTheme, overrideThemeId, overrideTheme]);

  const activeId = overrideThemeId ?? storedThemeId;
  const activeTheme = overrideTheme ?? resolveTheme(activeId, customThemes);
  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: composeAppTheme(activeTheme),
      themeId: activeTheme.id,
      setTheme,
      customThemes,
      refreshCustomThemes,
      autoTheme,
      setAutoTheme,
    }),
    [activeTheme, setTheme, customThemes, refreshCustomThemes, autoTheme, setAutoTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): AppTheme {
  return useContext(ThemeContext).theme;
}

export function useThemeControls(): { themeId: string; setTheme: (id: string) => Promise<void> } {
  const { themeId, setTheme } = useContext(ThemeContext);
  return { themeId, setTheme };
}

/** Access to user-authored themes and a way to reload them after the creator
 *  writes one. Kept separate from useThemeControls so most consumers don't
 *  re-render when the custom list changes. */
export function useCustomThemes(): {
  customThemes: Record<string, Theme>;
  refreshCustomThemes: () => Promise<void>;
} {
  const { customThemes, refreshCustomThemes } = useContext(ThemeContext);
  return { customThemes, refreshCustomThemes };
}

/** §A1: the automatic day/night config + its setter, for the theme hub UI. */
export function useAutoTheme(): { autoTheme: AutoThemeConfig; setAutoTheme: (config: AutoThemeConfig) => Promise<void> } {
  const { autoTheme, setAutoTheme } = useContext(ThemeContext);
  return { autoTheme, setAutoTheme };
}
