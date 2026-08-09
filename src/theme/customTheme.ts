// User-authored themes (theme creator). A person never hand-authors all ~24
// coordinated colours a theme needs — that's tedious and easy to make
// unreadable (§4.2). Instead they pick a small SEED (mode + three colours) and
// `buildCustomTheme` derives the full `ColourTokens`, category dots, and tab
// bar from it, exactly the way the built-in themes are hand-tuned but
// mechanically. An optional `overrides` map lets the Advanced editor pin any
// individual derived token afterwards.
//
// The output is a plain `Theme` — identical in shape to a built-in — so the
// rest of the app (ThemeContext, deriveVisuals, every consumer) treats a
// custom theme and a shipped one exactly alike.
import {
  contrastRatio,
  hexToHsl,
  hslToHex,
  mix,
  readableOn,
  setLightness,
  withAlpha,
} from './colorMath';
import type { CategoryColours, ColourTokens, Theme, ThemeMode } from './themes';
import type { CategoryKey } from './tokens';

/** The minimal input a person actually chooses in the creator. */
export interface CustomThemeSeed {
  mode: ThemeMode;
  bg: string; // the ground; sets the overall light/dark tone
  accent: string; // primary brand colour — buttons, active states
  secondary: string; // the "amber" slot — passive time, secondary accents
}

/** A persisted custom theme: its seed, any manual token overrides, and
 *  identity. Stored verbatim (see themeStorage.ts); the full palette is
 *  re-derived on load so improvements to the derivation reach existing
 *  themes. */
export interface CustomThemeDef {
  id: string; // always prefixed `custom-` (see isCustomThemeId)
  name: string;
  seed: CustomThemeSeed;
  // Any subset of colour tokens (plus category dots / tab bar) the user pinned
  // in the Advanced editor. Applied on top of the derived palette.
  overrides?: Partial<ColourTokens>;
  categoryOverrides?: Partial<CategoryColours>;
  tabBarBgOverride?: string;
  createdAt: string;
}

const CUSTOM_PREFIX = 'custom-';

export function isCustomThemeId(id: string): boolean {
  return id.startsWith(CUSTOM_PREFIX);
}

export function newCustomThemeId(): string {
  // Time + a little entropy — unique enough for a per-device list, and stable
  // as a settings key. No crypto dependency needed for a local id.
  return `${CUSTOM_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Sensible starting seeds so "Create theme" opens on something that already
 *  looks like a real theme, not black-on-black. */
export function defaultSeed(mode: ThemeMode): CustomThemeSeed {
  return mode === 'dark'
    ? { mode, bg: '#15161C', accent: '#5B9BD5', secondary: '#E0A34D' }
    : { mode, bg: '#FBF7F2', accent: '#C25E3A', secondary: '#E8A33D' };
}

// The seven category dots are always recognisable by hue — chicken gold, beef
// red, fish teal, etc. Deriving them from fixed hues (rather than the seed)
// keeps a custom theme's calendar readable no matter what accent was chosen.
const CATEGORY_HUE: Record<CategoryKey, number> = {
  chicken: 42,
  beef: 8,
  pork: 348,
  fish: 195,
  veg: 130,
  lamb: 300,
  other: 32,
};

function deriveCategoryColours(mode: ThemeMode): CategoryColours {
  const s = mode === 'dark' ? 46 : 52;
  const l = mode === 'dark' ? 62 : 46;
  const out = {} as CategoryColours;
  (Object.keys(CATEGORY_HUE) as CategoryKey[]).forEach((k) => {
    // "other" reads as a warm neutral, not a saturated hue.
    const sat = k === 'other' ? (mode === 'dark' ? 16 : 22) : s;
    out[k] = hslToHex({ h: CATEGORY_HUE[k], s: sat, l });
  });
  return out;
}

/** Nudge `base`'s lightness until it clears `min` contrast against `ground`,
 *  moving in the direction that has headroom for the theme's mode. Keeps hue
 *  and saturation so a red stays red — unlike mixing toward black/white. */
function contrastText(base: string, ground: string, mode: ThemeMode, min = 4.5): string {
  const step = mode === 'dark' ? 4 : -4;
  let l = hexToHsl(base).l;
  let out = base;
  for (let i = 0; i < 22; i += 1) {
    if (contrastRatio(out, ground) >= min) return out;
    l = Math.max(0, Math.min(100, l + step));
    out = setLightness(base, l);
    if (l === 0 || l === 100) break;
  }
  return out;
}

function deriveTokens(seed: CustomThemeSeed): ColourTokens {
  const { mode, bg, accent, secondary } = seed;
  const dark = mode === 'dark';
  const accentHue = hexToHsl(accent).h;

  // Surface sits above the ground: near-white on light, a step lighter on dark.
  const surface = dark ? setLightness(bg, hexToHsl(bg).l + 4) : mix(bg, '#FFFFFF', 0.66);
  const surfaceWarm = dark ? setLightness(bg, hexToHsl(bg).l + 6) : mix(bg, accent, 0.09);
  const chipBg = dark ? setLightness(bg, hexToHsl(bg).l + 8) : mix(bg, accent, 0.14);
  const border = dark ? setLightness(bg, hexToHsl(bg).l + 11) : mix(bg, '#000000', 0.09);
  const borderStrong = dark ? setLightness(bg, hexToHsl(bg).l + 13) : mix(bg, '#000000', 0.11);

  // Ink: a warm-ish near-black (light) / near-white (dark), tinted by the
  // accent hue so text doesn't read as a foreign cold grey on a warm ground.
  const ink = dark ? hslToHex({ h: accentHue, s: 8, l: 92 }) : hslToHex({ h: accentHue, s: 16, l: 14 });
  const ink2 = dark ? hslToHex({ h: accentHue, s: 6, l: 66 }) : hslToHex({ h: accentHue, s: 11, l: 44 });
  const ink3 = dark ? hslToHex({ h: accentHue, s: 5, l: 50 }) : hslToHex({ h: accentHue, s: 9, l: 62 });
  const ink4 = dark ? hslToHex({ h: accentHue, s: 5, l: 40 }) : hslToHex({ h: accentHue, s: 8, l: 72 });

  const green = dark ? hslToHex({ h: 128, s: 34, l: 56 }) : hslToHex({ h: 128, s: 36, l: 40 });
  const red = dark ? hslToHex({ h: 8, s: 68, l: 60 }) : hslToHex({ h: 8, s: 66, l: 42 });

  const tint = (c: string) => (dark ? mix(c, surface, 0.78) : mix(c, bg, 0.82));

  return {
    bg,
    surface,
    surfaceWarm,
    chipBg,
    border,
    borderStrong,

    accent,
    accentText: contrastText(accent, surface, mode),
    accentFg: mix(readableOn(accent), accent, 0.05),
    accentTint: tint(accent),

    amber: secondary,
    amberText: contrastText(secondary, surface, mode),
    amberTint: tint(secondary),

    green,
    greenTint: tint(green),

    red,
    redTint: tint(red),

    ink,
    ink2,
    ink3,
    ink4,

    scrim: dark ? 'rgba(0,0,0,0.6)' : withAlpha(ink, 0.36),
  };
}

/** Turn a stored definition into a full, render-ready Theme. */
export function buildCustomTheme(def: CustomThemeDef): Theme {
  const derived = deriveTokens(def.seed);
  const colors: ColourTokens = { ...derived, ...(def.overrides ?? {}) };
  const categoryColors: CategoryColours = {
    ...deriveCategoryColours(def.seed.mode),
    ...(def.categoryOverrides ?? {}),
  };
  const tabBarBg =
    def.tabBarBgOverride ??
    (def.seed.mode === 'dark' ? setLightness(def.seed.bg, Math.max(0, hexToHsl(def.seed.bg).l - 2)) : colors.surface);

  return {
    id: def.id,
    name: def.name.trim() || 'Custom theme',
    mode: def.seed.mode,
    colors,
    categoryColors,
    tabBarBg,
  };
}

/** The ordered list of overridable colour tokens, with human labels — drives
 *  the creator's Advanced editor and keeps it in sync with ColourTokens. */
export const OVERRIDABLE_TOKENS: { key: keyof ColourTokens; label: string }[] = [
  { key: 'bg', label: 'Background' },
  { key: 'surface', label: 'Surface' },
  { key: 'surfaceWarm', label: 'Surface (warm)' },
  { key: 'chipBg', label: 'Chip background' },
  { key: 'border', label: 'Border' },
  { key: 'borderStrong', label: 'Border (strong)' },
  { key: 'accent', label: 'Accent' },
  { key: 'accentText', label: 'Accent text' },
  { key: 'accentFg', label: 'Accent foreground' },
  { key: 'accentTint', label: 'Accent tint' },
  { key: 'amber', label: 'Secondary' },
  { key: 'amberText', label: 'Secondary text' },
  { key: 'amberTint', label: 'Secondary tint' },
  { key: 'green', label: 'Green' },
  { key: 'greenTint', label: 'Green tint' },
  { key: 'red', label: 'Red' },
  { key: 'redTint', label: 'Red tint' },
  { key: 'ink', label: 'Ink' },
  { key: 'ink2', label: 'Ink 2' },
  { key: 'ink3', label: 'Ink 3' },
  { key: 'ink4', label: 'Ink 4' },
];

/** The full derived palette for a seed, before overrides — the Advanced editor
 *  shows these as the starting values a user is tweaking away from. */
export function derivedTokensFor(seed: CustomThemeSeed): ColourTokens {
  return deriveTokens(seed);
}
