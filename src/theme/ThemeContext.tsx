// Theme provider + hooks (§4.1). Switching writes the `theme` row in `setting`
// (§2.3) and the provider re-renders — instant, no animation, applies
// everywhere at once (§4.1). Every component reads colour through `useTheme()`;
// there is no static colour import anywhere else in the app (§15).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { getSetting } from '../settings/getSetting';
import { setSetting } from '../settings/setSetting';
import { deriveVisuals, type VisualTokens } from './deriveVisuals';
import { fonts, fontSize, radius, spacing, type Fonts, type FontSize, type Radius, type Spacing } from './tokens';
import { DEFAULT_THEME_ID, themes, type Theme, type ThemeId } from './themes';

export const THEME_SETTING_KEY = 'theme';

// What components actually consume: the active theme's colour/category/mode
// data merged with the shared, non-themed type & layout tokens. The shape is
// deliberately the same one the codebase already used (`theme.colors.x`,
// `theme.spacing.y`, …) so migrating a consumer is a source change, not a
// rewrite.
export interface AppTheme {
  id: ThemeId;
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

function composeAppTheme(id: ThemeId): AppTheme {
  const t = themes[id];
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

interface ThemeContextValue {
  theme: AppTheme;
  themeId: ThemeId;
  setTheme: (id: ThemeId) => Promise<void>;
}

// Default context = Hearth with a no-op setter. A component rendered without a
// provider (e.g. an isolated snapshot test) still gets a complete, valid theme
// rather than throwing — the provider only ever *overrides* this default.
const ThemeContext = createContext<ThemeContextValue>({
  theme: composeAppTheme(DEFAULT_THEME_ID),
  themeId: DEFAULT_THEME_ID,
  setTheme: async () => {},
});

interface ThemeProviderProps {
  db?: DbClient;
  children: ReactNode;
  // Forces a specific theme for this subtree regardless of the persisted
  // setting — used by the picker's live preview (§4.10 step 2). When set, the
  // provider is display-only and never writes.
  overrideThemeId?: ThemeId;
}

export function ThemeProvider({ db, children, overrideThemeId }: ThemeProviderProps) {
  const [storedThemeId, setStoredThemeId] = useState<ThemeId>(DEFAULT_THEME_ID);

  // Load the persisted choice once on mount. Missing/unknown → Hearth (§4.1).
  useEffect(() => {
    if (!db || overrideThemeId) return;
    let cancelled = false;
    getSetting(db, THEME_SETTING_KEY)
      .then((value) => {
        if (cancelled) return;
        if (value && value in themes) setStoredThemeId(value as ThemeId);
      })
      .catch((error) => logger.warn('ui', 'Failed to load theme setting', { error: String(error) }));
    return () => {
      cancelled = true;
    };
  }, [db, overrideThemeId]);

  const setTheme = useCallback(
    async (id: ThemeId) => {
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

  const activeId = overrideThemeId ?? storedThemeId;
  const value = useMemo<ThemeContextValue>(
    () => ({ theme: composeAppTheme(activeId), themeId: activeId, setTheme }),
    [activeId, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): AppTheme {
  return useContext(ThemeContext).theme;
}

export function useThemeControls(): { themeId: ThemeId; setTheme: (id: ThemeId) => Promise<void> } {
  const { themeId, setTheme } = useContext(ThemeContext);
  return { themeId, setTheme };
}
