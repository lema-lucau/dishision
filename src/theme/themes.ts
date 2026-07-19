// The seven themes (§4.1–4.4). Every theme is the same shape — no optional
// keys, no fallbacks (§4.1, §15). TypeScript enforces completeness via
// `Record<ThemeId, Theme>` with a fully-required `ColourTokens`; the
// token-completeness test (src/test/theme/themeCompleteness.test.ts) catches
// anyone who reaches for a cast.
//
// Names are SEMANTIC, not descriptive (§4.1 rule 4): `accent`, not
// `terracotta`. The value changes per theme; the meaning does not. So the
// "amber" slot legitimately holds copper (Seaglass) or blue (Risograph), and
// "red" holds an amber-toned warning on dark grounds.
import type { CategoryKey } from './tokens';

export type ThemeId =
  | 'hearth'
  | 'ember'
  | 'seaglass'
  | 'clay'
  | 'risograph'
  | 'midnightKitchen'
  | 'dusk';

export type ThemeMode = 'light' | 'dark';

// The full required colour contract (§4.2) plus the derived tint/scrim slots
// the component layer relies on. `--accent-text` / `--amber-text` exist because
// a colour that works as a fill often fails as small text (§4.2); where the
// base already clears 4.5:1 the text variant is simply the same value — the
// slot is still filled.
export interface ColourTokens {
  bg: string;
  surface: string;
  surfaceWarm: string;
  chipBg: string;
  border: string;
  borderStrong: string;

  accent: string;
  accentText: string;
  accentFg: string;
  accentTint: string; // soft accent fill: active rows, selected chips, badges

  amber: string;
  amberText: string;
  amberTint: string;

  green: string;
  greenTint: string;

  red: string;
  redTint: string;

  ink: string;
  ink2: string;
  ink3: string;
  ink4: string;

  // Semi-transparent overlay behind modals/sheets. A token, not a hex literal,
  // so it tracks the theme's ink instead of a hardcoded warm-brown rgba (§15).
  scrim: string;
}

export type CategoryColours = Record<CategoryKey, string>;

export interface Theme {
  id: ThemeId;
  name: string;
  mode: ThemeMode; // drives status bar + keyboard appearance (§4.1)
  colors: ColourTokens;
  categoryColors: CategoryColours;
  // The tab bar is `surface` in every theme except the two darks, which step
  // one shade darker for separation from content (§4.3 notes). Always set so no
  // component needs a fallback.
  tabBarBg: string;
}

export const DEFAULT_THEME_ID: ThemeId = 'hearth';

// ── Hearth — default (§4.3) ────────────────────────────────────────────────
const hearth: Theme = {
  id: 'hearth',
  name: 'Hearth',
  mode: 'light',
  colors: {
    bg: '#FDF8F3',
    surface: '#FFFFFF',
    surfaceWarm: '#F5EDE5',
    chipBg: '#F3E9DF',
    border: '#EDE4DA',
    borderStrong: '#EFE6DC',
    accent: '#C25E3A',
    accentText: '#A34A2A',
    accentFg: '#FFF6F0',
    accentTint: '#F4E0D7',
    amber: '#E8A33D',
    amberText: '#92620E',
    amberTint: '#FAEBD2',
    green: '#6B8F5E',
    greenTint: '#E5EDDF',
    red: '#B3261E',
    redTint: '#F5DAD7',
    ink: '#2C2420',
    ink2: '#7A6E64',
    ink3: '#A0938A',
    ink4: '#B8ADA3',
    scrim: 'rgba(44,36,32,0.35)',
  },
  categoryColors: {
    chicken: '#E8A33D',
    beef: '#A33B2A',
    pork: '#D6837E',
    fish: '#4A8CA8',
    veg: '#6B8F5E',
    lamb: '#8B4A5C',
    other: '#9B8264',
  },
  tabBarBg: '#FFFFFF',
};

// ── Ember (§4.3) ───────────────────────────────────────────────────────────
const ember: Theme = {
  id: 'ember',
  name: 'Ember',
  mode: 'light',
  colors: {
    bg: '#FFFAF2',
    surface: '#FFFFFF',
    surfaceWarm: '#FDF1E1',
    chipBg: '#FCEBD5',
    border: '#F6E4CD',
    borderStrong: '#F6E9D8',
    accent: '#D94F1E',
    accentText: '#B03D14',
    accentFg: '#FFF6EF',
    accentTint: '#FBE3D6',
    amber: '#F5A623',
    amberText: '#9A6410',
    amberTint: '#FDEDD3',
    green: '#5C8A3C',
    greenTint: '#E6EFDD',
    red: '#B3261E',
    redTint: '#F8DCD7',
    ink: '#2A1F17',
    ink2: '#7E6A56',
    ink3: '#B0906B',
    ink4: '#C4A883',
    scrim: 'rgba(42,31,23,0.4)',
  },
  categoryColors: {
    chicken: '#F5A623',
    beef: '#B03D14',
    pork: '#E0958A',
    fish: '#4A8CA8',
    veg: '#5C8A3C',
    lamb: '#9A5266',
    other: '#A88860',
  },
  tabBarBg: '#FFFFFF',
};

// ── Seaglass (§4.3) ────────────────────────────────────────────────────────
const seaglass: Theme = {
  id: 'seaglass',
  name: 'Seaglass',
  mode: 'light',
  colors: {
    bg: '#F2F5F5',
    surface: '#FFFFFF',
    surfaceWarm: '#E7EEED',
    chipBg: '#E2E9E9',
    border: '#DCE4E4',
    borderStrong: '#E4EBEA',
    accent: '#0D6B66',
    accentText: '#0D6B66',
    accentFg: '#EFF9F8',
    accentTint: '#D6E7E5',
    amber: '#B45309',
    amberText: '#8F4207',
    amberTint: '#F1E1D0',
    green: '#0D6B66',
    greenTint: '#D6E7E5',
    red: '#B3261E',
    redTint: '#F2D9D5',
    ink: '#10292A',
    ink2: '#5A706F',
    ink3: '#879A99',
    ink4: '#9CACAB',
    scrim: 'rgba(16,41,42,0.38)',
  },
  categoryColors: {
    chicken: '#C77D11',
    beef: '#A33B2A',
    pork: '#C4746E',
    fish: '#2E7D96',
    veg: '#3E7D4F',
    lamb: '#8B4A5C',
    other: '#7C8B95',
  },
  tabBarBg: '#FFFFFF',
};

// ── Clay (§4.3) ────────────────────────────────────────────────────────────
const clay: Theme = {
  id: 'clay',
  name: 'Clay',
  mode: 'light',
  colors: {
    bg: '#F5F1EC',
    surface: '#FDFBF9',
    surfaceWarm: '#EDE7E0',
    chipBg: '#E9E2DA',
    border: '#E4DCD3',
    borderStrong: '#E8E1D9',
    accent: '#8A5A44',
    accentText: '#6E4736',
    accentFg: '#F8F3EE',
    accentTint: '#E8DDD5',
    amber: '#7A8B6F',
    amberText: '#56634E',
    amberTint: '#E2E7DC',
    green: '#7A8B6F',
    greenTint: '#E2E7DC',
    red: '#9C4A3C',
    redTint: '#ECD8D3',
    ink: '#302A24',
    ink2: '#7C7168',
    ink3: '#A69A8E',
    ink4: '#B5AAA0',
    scrim: 'rgba(48,42,36,0.38)',
  },
  categoryColors: {
    chicken: '#B8791E',
    beef: '#9C4A3C',
    pork: '#C08478',
    fish: '#4E7A88',
    veg: '#7A8B6F',
    lamb: '#8A5A6E',
    other: '#9C8E7E',
  },
  tabBarBg: '#FDFBF9',
};

// ── Risograph (§4.3) ───────────────────────────────────────────────────────
// Structural edge case: `border` is a deliberate hard black, not a hairline
// grey — part of the zine-print identity. Components reading `border` for a
// hard outline still work unmodified. The "amber" slot holds electric blue.
const risograph: Theme = {
  id: 'risograph',
  name: 'Risograph',
  mode: 'light',
  colors: {
    bg: '#FFFDF6',
    surface: '#FFFFFF',
    surfaceWarm: '#FFF3F7',
    chipBg: '#FFFFFF',
    border: '#191919',
    borderStrong: '#E2E0D8',
    accent: '#FF4F79',
    accentText: '#D62D5B',
    accentFg: '#FFFFFF',
    accentTint: '#FFE0E8',
    amber: '#2C6BED',
    amberText: '#1A4FC4',
    amberTint: '#DCE7FD',
    green: '#1E8A5F',
    greenTint: '#D6EFE4',
    red: '#D62D5B',
    redTint: '#FADAE3',
    ink: '#191919',
    ink2: '#5C5C5C',
    ink3: '#9C9C9C',
    ink4: '#BEBEBE',
    scrim: 'rgba(25,25,25,0.42)',
  },
  categoryColors: {
    chicken: '#FFB020',
    beef: '#FF4F79',
    pork: '#FF9EBB',
    fish: '#2C6BED',
    veg: '#1E8A5F',
    lamb: '#B057E0',
    other: '#5C5C5C',
  },
  tabBarBg: '#FFFFFF',
};

// ── Midnight Kitchen — dark (§4.3) ─────────────────────────────────────────
// Tab bar steps one shade darker than `surface` for separation. The "red" slot
// is an amber-toned warning to avoid two competing alarms on the dark ground.
const midnightKitchen: Theme = {
  id: 'midnightKitchen',
  name: 'Midnight Kitchen',
  mode: 'dark',
  colors: {
    bg: '#14161C',
    surface: '#1A1D25',
    surfaceWarm: '#1A1D25',
    chipBg: '#1F232C',
    border: '#232733',
    borderStrong: '#232733',
    accent: '#4ADE80',
    accentText: '#2FAE5E',
    accentFg: '#06240F',
    accentTint: '#18301F',
    amber: '#3B4657',
    amberText: '#8891A3',
    amberTint: '#252C38',
    green: '#4ADE80',
    greenTint: '#18301F',
    red: '#FBBF24',
    redTint: '#32280A',
    ink: '#E8EAEF',
    ink2: '#8891A3',
    ink3: '#6B7484',
    ink4: '#5A6273',
    scrim: 'rgba(0,0,0,0.6)',
  },
  categoryColors: {
    chicken: '#E9B949',
    beef: '#E8646A',
    pork: '#E0A0A6',
    fish: '#5B9BD5',
    veg: '#4ADE80',
    lamb: '#B084D6',
    other: '#8891A3',
  },
  tabBarBg: '#0F1116',
};

// ── Dusk — dark (§4.3) ─────────────────────────────────────────────────────
const dusk: Theme = {
  id: 'dusk',
  name: 'Dusk',
  mode: 'dark',
  colors: {
    bg: '#1B1A22',
    surface: '#222129',
    surfaceWarm: '#26252F',
    chipBg: '#26252F',
    border: '#2A2934',
    borderStrong: '#2A2934',
    accent: '#F2A65A',
    accentText: '#F2A65A',
    accentFg: '#2A1A08',
    accentTint: '#33281C',
    amber: '#5B7B9A',
    amberText: '#8FA9C0',
    amberTint: '#25303A',
    green: '#7FA96B',
    greenTint: '#263022',
    red: '#E8646A',
    redTint: '#341F22',
    ink: '#E6E3ED',
    ink2: '#918CA3',
    ink3: '#726D85',
    ink4: '#605B72',
    scrim: 'rgba(0,0,0,0.6)',
  },
  categoryColors: {
    chicken: '#F2A65A',
    beef: '#E8646A',
    pork: '#E0A9AA',
    fish: '#5B7B9A',
    veg: '#7FA96B',
    lamb: '#B58AC7',
    other: '#918CA3',
  },
  tabBarBg: '#151419',
};

export const themes: Record<ThemeId, Theme> = {
  hearth,
  ember,
  seaglass,
  clay,
  risograph,
  midnightKitchen,
  dusk,
};

// Picker grid order (§4.10 step 1): default first, then the rest.
export const THEME_ORDER: ThemeId[] = [
  'hearth',
  'ember',
  'seaglass',
  'clay',
  'risograph',
  'midnightKitchen',
  'dusk',
];
