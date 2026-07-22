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
  // Light
  | 'hearth'
  | 'ember'
  | 'seaglass'
  | 'clay'
  | 'risograph'
  | 'matcha'
  | 'blossom'
  | 'citrus'
  | 'lavender'
  | 'newsprint'
  | 'denim'
  | 'aubergine'
  | 'juniper'
  | 'rosewater'
  | 'peacock'
  | 'moss'
  | 'marigold'
  | 'graphite'
  | 'brick'
  | 'coral'
  // Dark
  | 'midnightKitchen'
  | 'dusk'
  | 'synthwave'
  | 'terminal'
  | 'bordeaux'
  | 'abyss'
  | 'espresso'
  | 'sapphire'
  | 'amethyst'
  | 'emerald'
  | 'garnet'
  | 'lagoon'
  | 'saffronDusk'
  | 'mauve'
  | 'onyx'
  | 'coralReef'
  | 'fern';

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

// ── Matcha — light ─────────────────────────────────────────────────────────
// Green-tea calm: pale green-cream ground, matcha accent, toasted-honey amber.
const matcha: Theme = {
  id: 'matcha',
  name: 'Matcha',
  mode: 'light',
  colors: {
    bg: '#F4F6EE',
    surface: '#FFFFFF',
    surfaceWarm: '#E9EFDD',
    chipBg: '#E4EBD6',
    border: '#DFE6D0',
    borderStrong: '#E4EBD6',
    accent: '#4C7A34',
    accentText: '#3B6128',
    accentFg: '#F3F8EC',
    accentTint: '#DEEBCD',
    amber: '#C98A2B',
    amberText: '#8A5C12',
    amberTint: '#F0E4CD',
    green: '#4C7A34',
    greenTint: '#DEEBCD',
    red: '#B23A2A',
    redTint: '#F1D8D2',
    ink: '#26301E',
    ink2: '#5E6B52',
    ink3: '#8C977F',
    ink4: '#A6AF9B',
    scrim: 'rgba(38,48,30,0.35)',
  },
  categoryColors: {
    chicken: '#C98A2B',
    beef: '#B23A2A',
    pork: '#CE8878',
    fish: '#3E7E86',
    veg: '#4C7A34',
    lamb: '#9A5266',
    other: '#8C8266',
  },
  tabBarBg: '#FFFFFF',
};

// ── Blossom — light ────────────────────────────────────────────────────────
// Soft rose and sage — spring cherry blossom, gentle and warm.
const blossom: Theme = {
  id: 'blossom',
  name: 'Blossom',
  mode: 'light',
  colors: {
    bg: '#FDF4F5',
    surface: '#FFFFFF',
    surfaceWarm: '#F9E7EB',
    chipBg: '#F6E1E6',
    border: '#F0D9DE',
    borderStrong: '#F3DEE3',
    accent: '#C24B6E',
    accentText: '#A23557',
    accentFg: '#FFF3F6',
    accentTint: '#F6DCE4',
    amber: '#C6803B',
    amberText: '#8F551A',
    amberTint: '#F3E3CF',
    green: '#6E9464',
    greenTint: '#E2ECDC',
    red: '#C0392B',
    redTint: '#F6DAD5',
    ink: '#331F26',
    ink2: '#7A6068',
    ink3: '#A88F97',
    ink4: '#C0A9B0',
    scrim: 'rgba(51,31,38,0.33)',
  },
  categoryColors: {
    chicken: '#C6803B',
    beef: '#B23F3A',
    pork: '#D98AA0',
    fish: '#4B87A0',
    veg: '#6E9464',
    lamb: '#9A5273',
    other: '#9A8288',
  },
  tabBarBg: '#FFFFFF',
};

// ── Citrus — light ─────────────────────────────────────────────────────────
// Bright and zesty: tangerine accent over lime — a wake-up palette. The
// "amber" slot holds lime (semantic, not literal — §4.1).
const citrus: Theme = {
  id: 'citrus',
  name: 'Citrus',
  mode: 'light',
  colors: {
    bg: '#FEFCF0',
    surface: '#FFFFFF',
    surfaceWarm: '#FBF3D6',
    chipBg: '#FAEFCB',
    border: '#F0E7C4',
    borderStrong: '#F4ECCF',
    accent: '#E08A0B',
    accentText: '#9E5E00',
    accentFg: '#FFF8EC',
    accentTint: '#FBE7C2',
    amber: '#6F9A1E',
    amberText: '#4E6E12',
    amberTint: '#E9F0CE',
    green: '#4E8A2E',
    greenTint: '#DEEBCB',
    red: '#C63D22',
    redTint: '#F6D9CF',
    ink: '#33290F',
    ink2: '#766A45',
    ink3: '#A2966B',
    ink4: '#BBB088',
    scrim: 'rgba(51,41,15,0.32)',
  },
  categoryColors: {
    chicken: '#E0A50B',
    beef: '#C63D22',
    pork: '#E09A6A',
    fish: '#2E8AA0',
    veg: '#6F9A1E',
    lamb: '#9A5A3C',
    other: '#9A8C5A',
  },
  tabBarBg: '#FFFFFF',
};

// ── Lavender — light ───────────────────────────────────────────────────────
// Provence violet with a honey counterpoint — floral but grown-up.
const lavender: Theme = {
  id: 'lavender',
  name: 'Lavender',
  mode: 'light',
  colors: {
    bg: '#F6F4FB',
    surface: '#FFFFFF',
    surfaceWarm: '#ECE7F6',
    chipBg: '#E7E1F3',
    border: '#E1DAF0',
    borderStrong: '#E7E1F3',
    accent: '#6E4FB0',
    accentText: '#573C93',
    accentFg: '#F4F0FC',
    accentTint: '#E3DAF3',
    amber: '#B07A2E',
    amberText: '#855610',
    amberTint: '#EEE3CD',
    green: '#5E9469',
    greenTint: '#DFEBDF',
    red: '#B3384A',
    redTint: '#F3D9DD',
    ink: '#241E33',
    ink2: '#655C7A',
    ink3: '#948BA8',
    ink4: '#ACA3BF',
    scrim: 'rgba(36,30,51,0.35)',
  },
  categoryColors: {
    chicken: '#C89A2E',
    beef: '#B3384A',
    pork: '#C888B0',
    fish: '#4B7BB0',
    veg: '#5E9469',
    lamb: '#8A5A9E',
    other: '#8C86A0',
  },
  tabBarBg: '#FFFFFF',
};

// ── Newsprint — light ──────────────────────────────────────────────────────
// Editorial cool-grey with ink-red and steel-blue — like a broadsheet.
const newsprint: Theme = {
  id: 'newsprint',
  name: 'Newsprint',
  mode: 'light',
  colors: {
    bg: '#F4F5F6',
    surface: '#FFFFFF',
    surfaceWarm: '#E9EBED',
    chipBg: '#E5E8EA',
    border: '#DEE2E5',
    borderStrong: '#E4E7EA',
    accent: '#B5342B',
    accentText: '#97281F',
    accentFg: '#FBF0EF',
    accentTint: '#F1D9D6',
    amber: '#35618C',
    amberText: '#2A4E72',
    amberTint: '#D9E2ED',
    green: '#3E7D4F',
    greenTint: '#DCE9DF',
    red: '#B5342B',
    redTint: '#F1D9D6',
    ink: '#1D2126',
    ink2: '#596069',
    ink3: '#8A9099',
    ink4: '#A6ABB2',
    scrim: 'rgba(29,33,38,0.4)',
  },
  categoryColors: {
    chicken: '#C08427',
    beef: '#B5342B',
    pork: '#C77E78',
    fish: '#35618C',
    veg: '#3E7D4F',
    lamb: '#8A4A5C',
    other: '#6E7680',
  },
  tabBarBg: '#FFFFFF',
};

// ── Denim — light ──────────────────────────────────────────────────────────
// Cornflower-indigo blue on warm linen — delft pottery, a kitchen-apron blue.
// The neutrals stay warm (cream, not grey) so the blue reads as an accent
// choice, not a shift to a cooler design system.
const denim: Theme = {
  id: 'denim',
  name: 'Denim',
  mode: 'light',
  colors: {
    bg: '#FAF7F1',
    surface: '#FFFFFF',
    surfaceWarm: '#ECE7DC',
    chipBg: '#E6E1D3',
    border: '#DED8C8',
    borderStrong: '#E2DCCC',
    accent: '#3A5A8C',
    accentText: '#2C4670',
    accentFg: '#F3F6FB',
    accentTint: '#D8E1EE',
    amber: '#C98A2E',
    amberText: '#8C5D12',
    amberTint: '#F0E0BE',
    green: '#6E8F5A',
    greenTint: '#E4EAD9',
    red: '#B3392A',
    redTint: '#F0D6CD',
    ink: '#232620',
    ink2: '#6C6A5C',
    ink3: '#9A9684',
    ink4: '#B6B2A0',
    scrim: 'rgba(20,24,32,0.4)',
  },
  categoryColors: {
    chicken: '#C98A2E',
    beef: '#A3402A',
    pork: '#CE8E82',
    fish: '#3A5A8C',
    veg: '#6E8F5A',
    lamb: '#7C4E64',
    other: '#8C8670',
  },
  tabBarBg: '#FFFFFF',
};

// ── Aubergine — light ──────────────────────────────────────────────────────
// Deep eggplant purple against parchment — moody and grown-up, not pastel.
const aubergine: Theme = {
  id: 'aubergine',
  name: 'Aubergine',
  mode: 'light',
  colors: {
    bg: '#FAF6F5',
    surface: '#FFFFFF',
    surfaceWarm: '#EDE1E1',
    chipBg: '#E7D9DA',
    border: '#DFD0D1',
    borderStrong: '#E3D5D6',
    accent: '#5B3B66',
    accentText: '#442B4D',
    accentFg: '#F6F0F7',
    accentTint: '#E1D2E3',
    amber: '#C1832E',
    amberText: '#875A12',
    amberTint: '#EFDFC0',
    green: '#6D8556',
    greenTint: '#E2E6D6',
    red: '#A73B2C',
    redTint: '#EBD3CC',
    ink: '#271E27',
    ink2: '#726672',
    ink3: '#9E9299',
    ink4: '#B7AEB3',
    scrim: 'rgba(39,30,39,0.38)',
  },
  categoryColors: {
    chicken: '#C1832E',
    beef: '#8E3A2C',
    pork: '#C68C98',
    fish: '#4A7C8E',
    veg: '#6D8556',
    lamb: '#5B3B66',
    other: '#948A90',
  },
  tabBarBg: '#FFFFFF',
};

// ── Juniper — light ────────────────────────────────────────────────────────
// Deep pine blue-green — gin botanicals, herb garden at dusk. Blue-leaning
// green, distinct from Moss's warmer, yellower green.
const juniper: Theme = {
  id: 'juniper',
  name: 'Juniper',
  mode: 'light',
  colors: {
    bg: '#F7F8F2',
    surface: '#FFFFFF',
    surfaceWarm: '#E8ECDE',
    chipBg: '#E1E7D5',
    border: '#D9E0CB',
    borderStrong: '#DEE4D0',
    accent: '#2E6858',
    accentText: '#234E42',
    accentFg: '#EFF7F3',
    accentTint: '#D4E4DD',
    amber: '#C48A2E',
    amberText: '#895D13',
    amberTint: '#F0E0C0',
    green: '#2E6858',
    greenTint: '#D4E4DD',
    red: '#AC3B26',
    redTint: '#EDD5CB',
    ink: '#1E2A22',
    ink2: '#62705F',
    ink3: '#93A08C',
    ink4: '#AFB9A6',
    scrim: 'rgba(20,32,26,0.4)',
  },
  categoryColors: {
    chicken: '#C48A2E',
    beef: '#A3402A',
    pork: '#CC9280',
    fish: '#3E7E92',
    veg: '#2E6858',
    lamb: '#7C5164',
    other: '#8B927E',
  },
  tabBarBg: '#FFFFFF',
};

// ── Rosewater — light ──────────────────────────────────────────────────────
// Dusty rose-mauve, mature rather than sweet — brunch bistro, blush marble.
const rosewater: Theme = {
  id: 'rosewater',
  name: 'Rosewater',
  mode: 'light',
  colors: {
    bg: '#FCF5F3',
    surface: '#FFFFFF',
    surfaceWarm: '#F1DFDB',
    chipBg: '#EDD6D1',
    border: '#E6CDC8',
    borderStrong: '#EAD2CD',
    accent: '#A85A5C',
    accentText: '#86444A',
    accentFg: '#FAF0EF',
    accentTint: '#E9D2D0',
    amber: '#C0842E',
    amberText: '#895A13',
    amberTint: '#EFDFC0',
    green: '#6E8858',
    greenTint: '#E3E8D8',
    red: '#9E3B2C',
    redTint: '#EAD2CB',
    ink: '#2C2020',
    ink2: '#7C6764',
    ink3: '#A69390',
    ink4: '#BFAEAB',
    scrim: 'rgba(44,32,32,0.36)',
  },
  categoryColors: {
    chicken: '#C0842E',
    beef: '#8E3A2C',
    pork: '#C68C86',
    fish: '#4A7E8E',
    veg: '#6E8858',
    lamb: '#A85A5C',
    other: '#998B87',
  },
  tabBarBg: '#FFFFFF',
};

// ── Peacock — light ────────────────────────────────────────────────────────
// Jewel-tone teal, kept on a warm ivory ground rather than Seaglass's cool
// grey — the difference between a ceramic glaze and a rinsed-out beach tint.
const peacock: Theme = {
  id: 'peacock',
  name: 'Peacock',
  mode: 'light',
  colors: {
    bg: '#F9F7F0',
    surface: '#FFFFFF',
    surfaceWarm: '#E7E9DA',
    chipBg: '#DFE3D0',
    border: '#D6DBC6',
    borderStrong: '#DCE0CB',
    accent: '#146B72',
    accentText: '#0F5157',
    accentFg: '#EAF6F6',
    accentTint: '#CDE3E3',
    amber: '#C68A2E',
    amberText: '#8A5D12',
    amberTint: '#F0E0C0',
    green: '#5F8548',
    greenTint: '#E0E7D2',
    red: '#B23A26',
    redTint: '#F0D6CC',
    ink: '#1B2624',
    ink2: '#5F6E6A',
    ink3: '#8FA09B',
    ink4: '#ADB9B4',
    scrim: 'rgba(16,32,32,0.4)',
  },
  categoryColors: {
    chicken: '#C68A2E',
    beef: '#A3402A',
    pork: '#CE9080',
    fish: '#146B72',
    veg: '#5F8548',
    lamb: '#8B4A5C',
    other: '#889186',
  },
  tabBarBg: '#FFFFFF',
};

// ── Moss — light ───────────────────────────────────────────────────────────
// Soft warm sage-green, yellow-leaning and grounded — distinct from
// Juniper's cooler, bluer pine.
const moss: Theme = {
  id: 'moss',
  name: 'Moss',
  mode: 'light',
  colors: {
    bg: '#F8F9EE',
    surface: '#FFFFFF',
    surfaceWarm: '#E9EBD4',
    chipBg: '#E1E5C6',
    border: '#D8DEBB',
    borderStrong: '#DEE3C4',
    accent: '#5C7538',
    accentText: '#465A29',
    accentFg: '#F2F5E6',
    accentTint: '#DCE2C0',
    amber: '#BE8A2E',
    amberText: '#855D13',
    amberTint: '#EEE0C0',
    green: '#5C7538',
    greenTint: '#DCE2C0',
    red: '#A83E26',
    redTint: '#EBD6CC',
    ink: '#21260F',
    ink2: '#656F49',
    ink3: '#969F74',
    ink4: '#B2B991',
    scrim: 'rgba(30,34,15,0.38)',
  },
  categoryColors: {
    chicken: '#BE8A2E',
    beef: '#8E3E28',
    pork: '#C8977C',
    fish: '#43788C',
    veg: '#5C7538',
    lamb: '#7A5240',
    other: '#8C8A5E',
  },
  tabBarBg: '#FFFFFF',
};

// ── Marigold — light ───────────────────────────────────────────────────────
// Bold saturated marigold gold — festival flowers, turmeric. The one warm
// anchor in this set, but pitched deeper and more saturated than Hearth or
// Ember so it doesn't read as a re-skin of either.
const marigold: Theme = {
  id: 'marigold',
  name: 'Marigold',
  mode: 'light',
  colors: {
    bg: '#FFFBEF',
    surface: '#FFFFFF',
    surfaceWarm: '#FBF0D2',
    chipBg: '#F8E8BC',
    border: '#F0E0B8',
    borderStrong: '#F4E5C2',
    accent: '#C8890A',
    accentText: '#96650A',
    accentFg: '#FFF8E8',
    accentTint: '#F5DFA8',
    amber: '#B8571E',
    amberText: '#833F10',
    amberTint: '#EFD8C0',
    green: '#6C8A3A',
    greenTint: '#E4EACE',
    red: '#B23A22',
    redTint: '#F0D7CC',
    ink: '#2E2610',
    ink2: '#7C7048',
    ink3: '#A69A70',
    ink4: '#BFB490',
    scrim: 'rgba(46,38,16,0.36)',
  },
  categoryColors: {
    chicken: '#C8890A',
    beef: '#B23A22',
    pork: '#DDA278',
    fish: '#437E92',
    veg: '#6C8A3A',
    lamb: '#8C5240',
    other: '#A0925E',
  },
  tabBarBg: '#FFFFFF',
};

// ── Graphite — light ───────────────────────────────────────────────────────
// Near-neutral warm charcoal accent — chalkboard menu, quiet monochrome
// sophistication with a whisper of warmth rather than Newsprint's flat grey.
const graphite: Theme = {
  id: 'graphite',
  name: 'Graphite',
  mode: 'light',
  colors: {
    bg: '#F7F5F1',
    surface: '#FFFFFF',
    surfaceWarm: '#E8E4DC',
    chipBg: '#E0DCD2',
    border: '#D6D1C5',
    borderStrong: '#DCD7CB',
    accent: '#4A4038',
    accentText: '#362D27',
    accentFg: '#F5F3EF',
    accentTint: '#DEDACF',
    amber: '#B87A2E',
    amberText: '#825313',
    amberTint: '#EEDDBE',
    green: '#6B7A54',
    greenTint: '#E1E5D3',
    red: '#A5432E',
    redTint: '#EAD5CC',
    ink: '#201C17',
    ink2: '#6C6459',
    ink3: '#999283',
    ink4: '#B5AF9F',
    scrim: 'rgba(32,28,23,0.4)',
  },
  categoryColors: {
    chicken: '#B87A2E',
    beef: '#8E4530',
    pork: '#C99A82',
    fish: '#4C7686',
    veg: '#6B7A54',
    lamb: '#7C5A50',
    other: '#4A4038',
  },
  tabBarBg: '#FFFFFF',
};

// ── Brick — light ──────────────────────────────────────────────────────────
// Deep venetian brick red — exposed brick, an old bakery oven. More brown
// and architectural than Hearth's terracotta, less orange than Ember's rust.
const brick: Theme = {
  id: 'brick',
  name: 'Brick',
  mode: 'light',
  colors: {
    bg: '#FBF4F0',
    surface: '#FFFFFF',
    surfaceWarm: '#EEDDD3',
    chipBg: '#E9D3C6',
    border: '#E0C8BA',
    borderStrong: '#E5CEC0',
    accent: '#96392A',
    accentText: '#742C20',
    accentFg: '#FAF0EC',
    accentTint: '#E3CDC3',
    amber: '#B87A26',
    amberText: '#825312',
    amberTint: '#EEDCBE',
    green: '#6B7F4C',
    greenTint: '#E1E6D2',
    red: '#96392A',
    redTint: '#E3CDC3',
    ink: '#291B16',
    ink2: '#7A6459',
    ink3: '#A69285',
    ink4: '#BFAD9F',
    scrim: 'rgba(41,27,22,0.4)',
  },
  categoryColors: {
    chicken: '#B87A26',
    beef: '#742C20',
    pork: '#C9917E',
    fish: '#42788A',
    veg: '#6B7F4C',
    lamb: '#7C4A46',
    other: '#9C8A78',
  },
  tabBarBg: '#FFFFFF',
};

// ── Coral — light ──────────────────────────────────────────────────────────
// Vivid matte coral-pink — fresh salmon, a summer seafood counter. Bold and
// playful but never neon.
const coral: Theme = {
  id: 'coral',
  name: 'Coral',
  mode: 'light',
  colors: {
    bg: '#FFF6F2',
    surface: '#FFFFFF',
    surfaceWarm: '#FCE6DC',
    chipBg: '#FADCCE',
    border: '#F2D5C6',
    borderStrong: '#F6DACB',
    accent: '#E0603F',
    accentText: '#B84A2E',
    accentFg: '#FFF4EF',
    accentTint: '#F8D9CB',
    amber: '#D9962E',
    amberText: '#966412',
    amberTint: '#F6E4C2',
    green: '#5E8B52',
    greenTint: '#E3EBD9',
    red: '#C0392B',
    redTint: '#F2D6CE',
    ink: '#301E18',
    ink2: '#806A5D',
    ink3: '#A99486',
    ink4: '#C0AD9F',
    scrim: 'rgba(48,30,24,0.36)',
  },
  categoryColors: {
    chicken: '#D9962E',
    beef: '#A83A26',
    pork: '#E0603F',
    fish: '#4586A0',
    veg: '#5E8B52',
    lamb: '#8C5048',
    other: '#9C8B7C',
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

// ── Synthwave — dark ───────────────────────────────────────────────────────
// Retro-future neon: magenta accent, electric-cyan passive on deep indigo.
// The "amber" slot holds cyan (semantic, not literal — §4.1).
const synthwave: Theme = {
  id: 'synthwave',
  name: 'Synthwave',
  mode: 'dark',
  colors: {
    bg: '#16121F',
    surface: '#1E1830',
    surfaceWarm: '#241C38',
    chipBg: '#271E3E',
    border: '#322850',
    borderStrong: '#322850',
    accent: '#FF4D8D',
    accentText: '#FF6FA3',
    accentFg: '#1A0512',
    accentTint: '#33172A',
    amber: '#22D3EE',
    amberText: '#5FE0F2',
    amberTint: '#103038',
    green: '#34E0A1',
    greenTint: '#123528',
    red: '#FB7185',
    redTint: '#35141C',
    ink: '#EDE7FA',
    ink2: '#A99FD0',
    ink3: '#7B7099',
    ink4: '#635A80',
    scrim: 'rgba(0,0,0,0.62)',
  },
  categoryColors: {
    chicken: '#F5C542',
    beef: '#FB7185',
    pork: '#FF9EC7',
    fish: '#22D3EE',
    veg: '#34E0A1',
    lamb: '#C084FC',
    other: '#A99FD0',
  },
  tabBarBg: '#100D18',
};

// ── Terminal — dark ────────────────────────────────────────────────────────
// Phosphor-green on near-black — a CRT console. Amber slot is amber-CRT gold.
const terminal: Theme = {
  id: 'terminal',
  name: 'Terminal',
  mode: 'dark',
  colors: {
    bg: '#0C0F0C',
    surface: '#121712',
    surfaceWarm: '#141B14',
    chipBg: '#172017',
    border: '#1E2A1E',
    borderStrong: '#1E2A1E',
    accent: '#3BE86B',
    accentText: '#4FDD77',
    accentFg: '#04140A',
    accentTint: '#122A17',
    amber: '#C7B03A',
    amberText: '#D8C566',
    amberTint: '#2A2610',
    green: '#3BE86B',
    greenTint: '#122A17',
    red: '#F0553D',
    redTint: '#2E140F',
    ink: '#D6F5D6',
    ink2: '#7FA97F',
    ink3: '#5E7E5E',
    ink4: '#4A614A',
    scrim: 'rgba(0,0,0,0.65)',
  },
  categoryColors: {
    chicken: '#C7B03A',
    beef: '#F0553D',
    pork: '#E0908A',
    fish: '#3AB0C7',
    veg: '#3BE86B',
    lamb: '#B07AD0',
    other: '#7FA97F',
  },
  tabBarBg: '#080B08',
};

// ── Bordeaux — dark ────────────────────────────────────────────────────────
// Deep wine with gold and rosé — candlelit, elegant.
const bordeaux: Theme = {
  id: 'bordeaux',
  name: 'Bordeaux',
  mode: 'dark',
  colors: {
    bg: '#1E1013',
    surface: '#281619',
    surfaceWarm: '#2E1A1E',
    chipBg: '#331D21',
    border: '#3B2328',
    borderStrong: '#3B2328',
    accent: '#E0A458',
    accentText: '#E9B87A',
    accentFg: '#2A1608',
    accentTint: '#3A2416',
    amber: '#C25E7A',
    amberText: '#D98BA0',
    amberTint: '#331A22',
    green: '#8FA96B',
    greenTint: '#23301C',
    red: '#E8646A',
    redTint: '#331A1C',
    ink: '#F3E6E1',
    ink2: '#C0A29C',
    ink3: '#94756F',
    ink4: '#7A5C57',
    scrim: 'rgba(0,0,0,0.6)',
  },
  categoryColors: {
    chicken: '#E0A458',
    beef: '#E8646A',
    pork: '#D98BA0',
    fish: '#5B9AB0',
    veg: '#8FA96B',
    lamb: '#C57AA0',
    other: '#C0A29C',
  },
  tabBarBg: '#160B0E',
};

// ── Abyss — dark ───────────────────────────────────────────────────────────
// Deep-sea navy with aqua and a warm buoy-orange — cold water, warm light.
const abyss: Theme = {
  id: 'abyss',
  name: 'Abyss',
  mode: 'dark',
  colors: {
    bg: '#0B1620',
    surface: '#10202C',
    surfaceWarm: '#12232F',
    chipBg: '#162937',
    border: '#1E3444',
    borderStrong: '#1E3444',
    accent: '#2DD4BF',
    accentText: '#4EE0CD',
    accentFg: '#04211D',
    accentTint: '#0E2E2C',
    amber: '#E0A34D',
    amberText: '#EDB868',
    amberTint: '#2E2413',
    green: '#34D399',
    greenTint: '#0E2E23',
    red: '#F87171',
    redTint: '#301518',
    ink: '#E2EEF3',
    ink2: '#9DB4C0',
    ink3: '#6E8896',
    ink4: '#566E7A',
    scrim: 'rgba(0,0,0,0.6)',
  },
  categoryColors: {
    chicken: '#E0A34D',
    beef: '#F87171',
    pork: '#E29AA0',
    fish: '#2DD4BF',
    veg: '#34D399',
    lamb: '#B08AD0',
    other: '#9DB4C0',
  },
  tabBarBg: '#071018',
};

// ── Espresso — dark ────────────────────────────────────────────────────────
// Warm roasted brown with caramel accent and pistachio passive — cosy.
const espresso: Theme = {
  id: 'espresso',
  name: 'Espresso',
  mode: 'dark',
  colors: {
    bg: '#1A1512',
    surface: '#241C18',
    surfaceWarm: '#2A211C',
    chipBg: '#2F2620',
    border: '#382D26',
    borderStrong: '#382D26',
    accent: '#D99A5B',
    accentText: '#E6AE74',
    accentFg: '#2A1808',
    accentTint: '#37271A',
    amber: '#9AA36B',
    amberText: '#B6BE86',
    amberTint: '#29301C',
    green: '#8FB06B',
    greenTint: '#25301C',
    red: '#E27366',
    redTint: '#331A16',
    ink: '#F0E7DE',
    ink2: '#BCA895',
    ink3: '#8E7A67',
    ink4: '#6E5C4C',
    scrim: 'rgba(0,0,0,0.6)',
  },
  categoryColors: {
    chicken: '#D99A5B',
    beef: '#E27366',
    pork: '#D89A88',
    fish: '#6BA3B0',
    veg: '#9AA36B',
    lamb: '#C58A70',
    other: '#BCA895',
  },
  tabBarBg: '#120E0B',
};

// ── Sapphire — dark ────────────────────────────────────────────────────────
// Confident jewel-blue on a warm near-black ground — the neutrals stay
// brown-black like Espresso rather than shifting cold/navy like Abyss.
const sapphire: Theme = {
  id: 'sapphire',
  name: 'Sapphire',
  mode: 'dark',
  colors: {
    bg: '#17140F',
    surface: '#211D17',
    surfaceWarm: '#27221B',
    chipBg: '#2C271F',
    border: '#362F26',
    borderStrong: '#362F26',
    accent: '#5B84C4',
    accentText: '#7CA0D6',
    accentFg: '#0F1B2C',
    accentTint: '#1E2A3D',
    amber: '#D9A23F',
    amberText: '#E6BA68',
    amberTint: '#332711',
    green: '#8FA96B',
    greenTint: '#23301C',
    red: '#E0594A',
    redTint: '#331B16',
    ink: '#EDE8DF',
    ink2: '#B7AA98',
    ink3: '#877C6C',
    ink4: '#675E51',
    scrim: 'rgba(0,0,0,0.6)',
  },
  categoryColors: {
    chicken: '#D9A23F',
    beef: '#E0594A',
    pork: '#DFA095',
    fish: '#5B84C4',
    veg: '#8FA96B',
    lamb: '#B084AE',
    other: '#B7AA98',
  },
  tabBarBg: '#100D0A',
};

// ── Amethyst — dark ────────────────────────────────────────────────────────
// Confident jewel-purple, deep and moody against a warm charcoal ground.
const amethyst: Theme = {
  id: 'amethyst',
  name: 'Amethyst',
  mode: 'dark',
  colors: {
    bg: '#16130F',
    surface: '#201A17',
    surfaceWarm: '#261F1B',
    chipBg: '#2B2420',
    border: '#352D27',
    borderStrong: '#352D27',
    accent: '#A472C4',
    accentText: '#B98FD3',
    accentFg: '#201029',
    accentTint: '#2E2237',
    amber: '#D9A23F',
    amberText: '#E6BA68',
    amberTint: '#332711',
    green: '#8FA96B',
    greenTint: '#23301C',
    red: '#E0594A',
    redTint: '#331B16',
    ink: '#EEE7E2',
    ink2: '#B9A9A2',
    ink3: '#897A75',
    ink4: '#695C58',
    scrim: 'rgba(0,0,0,0.6)',
  },
  categoryColors: {
    chicken: '#D9A23F',
    beef: '#E0594A',
    pork: '#DFA095',
    fish: '#5E97B0',
    veg: '#8FA96B',
    lamb: '#A472C4',
    other: '#B9A9A2',
  },
  tabBarBg: '#0F0C0A',
};

// ── Emerald — dark ─────────────────────────────────────────────────────────
// Confident jewel-green, bright enough to carry contrast on a dark ground.
const emerald: Theme = {
  id: 'emerald',
  name: 'Emerald',
  mode: 'dark',
  colors: {
    bg: '#131611',
    surface: '#1C201A',
    surfaceWarm: '#222620',
    chipBg: '#272B24',
    border: '#31362D',
    borderStrong: '#31362D',
    accent: '#4FA976',
    accentText: '#6FBD8F',
    accentFg: '#0A2016',
    accentTint: '#1A3324',
    amber: '#D9A23F',
    amberText: '#E6BA68',
    amberTint: '#332711',
    green: '#4FA976',
    greenTint: '#1A3324',
    red: '#E0594A',
    redTint: '#331B16',
    ink: '#E8EDE5',
    ink2: '#ABB6A5',
    ink3: '#7D877A',
    ink4: '#60685D',
    scrim: 'rgba(0,0,0,0.6)',
  },
  categoryColors: {
    chicken: '#D9A23F',
    beef: '#E0594A',
    pork: '#DFA095',
    fish: '#5C97AC',
    veg: '#4FA976',
    lamb: '#B084AE',
    other: '#ABB6A5',
  },
  tabBarBg: '#0D0F0B',
};

// ── Garnet — dark ──────────────────────────────────────────────────────────
// Confident jewel-ruby red, leaning crimson rather than the orange-red of
// Chili or Cinder.
const garnet: Theme = {
  id: 'garnet',
  name: 'Garnet',
  mode: 'dark',
  colors: {
    bg: '#170F0E',
    surface: '#211815',
    surfaceWarm: '#271C19',
    chipBg: '#2C201C',
    border: '#362924',
    borderStrong: '#362924',
    accent: '#C7454A',
    accentText: '#D9686C',
    accentFg: '#2A0E0F',
    accentTint: '#3A1E1E',
    amber: '#D9A23F',
    amberText: '#E6BA68',
    amberTint: '#332711',
    green: '#8FA96B',
    greenTint: '#23301C',
    red: '#C7454A',
    redTint: '#3A1E1E',
    ink: '#F1E6E3',
    ink2: '#BCA6A2',
    ink3: '#8B7975',
    ink4: '#6C5D5A',
    scrim: 'rgba(0,0,0,0.6)',
  },
  categoryColors: {
    chicken: '#D9A23F',
    beef: '#C7454A',
    pork: '#D69299',
    fish: '#5C93A6',
    veg: '#8FA96B',
    lamb: '#B0687A',
    other: '#BCA6A2',
  },
  tabBarBg: '#110A09',
};

// ── Lagoon — dark ──────────────────────────────────────────────────────────
// Confident jewel-teal, brighter than Peacock for dark-mode contrast.
const lagoon: Theme = {
  id: 'lagoon',
  name: 'Lagoon',
  mode: 'dark',
  colors: {
    bg: '#101613',
    surface: '#19201C',
    surfaceWarm: '#1F2621',
    chipBg: '#242B25',
    border: '#2E362F',
    borderStrong: '#2E362F',
    accent: '#2EB0A6',
    accentText: '#57C4BB',
    accentFg: '#072220',
    accentTint: '#163330',
    amber: '#D9A23F',
    amberText: '#E6BA68',
    amberTint: '#332711',
    green: '#6FAF6B',
    greenTint: '#1E301C',
    red: '#E0594A',
    redTint: '#331B16',
    ink: '#E5EDEB',
    ink2: '#A6B6B3',
    ink3: '#798886',
    ink4: '#5D6A68',
    scrim: 'rgba(0,0,0,0.6)',
  },
  categoryColors: {
    chicken: '#D9A23F',
    beef: '#E0594A',
    pork: '#DFA095',
    fish: '#2EB0A6',
    veg: '#6FAF6B',
    lamb: '#B0819E',
    other: '#A6B6B3',
  },
  tabBarBg: '#0B100E',
};

// ── Saffron Dusk — dark ────────────────────────────────────────────────────
// Warm gold glowing against a dark ground — the one warm anchor in this set.
const saffronDusk: Theme = {
  id: 'saffronDusk',
  name: 'Saffron Dusk',
  mode: 'dark',
  colors: {
    bg: '#191307',
    surface: '#241C0F',
    surfaceWarm: '#2A2112',
    chipBg: '#302615',
    border: '#3B2F1A',
    borderStrong: '#3B2F1A',
    accent: '#E0A93C',
    accentText: '#EABE63',
    accentFg: '#2E2004',
    accentTint: '#3E3115',
    amber: '#D67B3A',
    amberText: '#E39860',
    amberTint: '#3A2814',
    green: '#90A155',
    greenTint: '#262C17',
    red: '#DD5C3D',
    redTint: '#351E16',
    ink: '#F4EAD9',
    ink2: '#C3AE8C',
    ink3: '#90805F',
    ink4: '#6F6249',
    scrim: 'rgba(0,0,0,0.6)',
  },
  categoryColors: {
    chicken: '#E0A93C',
    beef: '#C6532F',
    pork: '#DDA678',
    fish: '#5C93A6',
    veg: '#90A155',
    lamb: '#B37860',
    other: '#C3AE8C',
  },
  tabBarBg: '#120E06',
};

// ── Mauve — dark ───────────────────────────────────────────────────────────
// Dusty rose-plum against a warm charcoal ground, softer than Garnet.
const mauve: Theme = {
  id: 'mauve',
  name: 'Mauve',
  mode: 'dark',
  colors: {
    bg: '#161112',
    surface: '#201819',
    surfaceWarm: '#261D1E',
    chipBg: '#2B2122',
    border: '#362A2C',
    borderStrong: '#362A2C',
    accent: '#C4768A',
    accentText: '#D4909F',
    accentFg: '#2A1116',
    accentTint: '#3A2126',
    amber: '#D9A23F',
    amberText: '#E6BA68',
    amberTint: '#332711',
    green: '#8FA96B',
    greenTint: '#23301C',
    red: '#E0594A',
    redTint: '#331B16',
    ink: '#F1E5E7',
    ink2: '#BDA6A9',
    ink3: '#8C7679',
    ink4: '#6D595C',
    scrim: 'rgba(0,0,0,0.6)',
  },
  categoryColors: {
    chicken: '#D9A23F',
    beef: '#B0503F',
    pork: '#C4768A',
    fish: '#5C8998',
    veg: '#8FA96B',
    lamb: '#A15A78',
    other: '#BDA6A9',
  },
  tabBarBg: '#100B0C',
};

// ── Onyx — dark ────────────────────────────────────────────────────────────
// Near-monochrome warm charcoal — quiet luxury, a single bronze glint of
// saturation against an otherwise restrained ground.
const onyx: Theme = {
  id: 'onyx',
  name: 'Onyx',
  mode: 'dark',
  colors: {
    bg: '#131211',
    surface: '#1C1A18',
    surfaceWarm: '#211F1C',
    chipBg: '#262320',
    border: '#302C28',
    borderStrong: '#302C28',
    accent: '#B8935E',
    accentText: '#C9A876',
    accentFg: '#241A0D',
    accentTint: '#362B1C',
    amber: '#8C9270',
    amberText: '#A6AC8C',
    amberTint: '#2A2B20',
    green: '#7C8F63',
    greenTint: '#212617',
    red: '#B85D48',
    redTint: '#301D16',
    ink: '#EAE6E0',
    ink2: '#B3ACA3',
    ink3: '#847E76',
    ink4: '#66615A',
    scrim: 'rgba(0,0,0,0.62)',
  },
  categoryColors: {
    chicken: '#B8935E',
    beef: '#A54F3C',
    pork: '#C0998A',
    fish: '#5C7F8A',
    veg: '#7C8F63',
    lamb: '#8C6E6A',
    other: '#B3ACA3',
  },
  tabBarBg: '#0D0C0B',
};

// ── Coral Reef — dark ──────────────────────────────────────────────────────
// Vivid coral, bright against a dark ground — bold contrast without neon.
const coralReef: Theme = {
  id: 'coralReef',
  name: 'Coral Reef',
  mode: 'dark',
  colors: {
    bg: '#180F0C',
    surface: '#221713',
    surfaceWarm: '#281C17',
    chipBg: '#2D211B',
    border: '#382A22',
    borderStrong: '#382A22',
    accent: '#E87A56',
    accentText: '#EF9877',
    accentFg: '#2E1006',
    accentTint: '#3D2317',
    amber: '#D9A23F',
    amberText: '#E6BA68',
    amberTint: '#332711',
    green: '#86A758',
    greenTint: '#212E18',
    red: '#E0594A',
    redTint: '#331B16',
    ink: '#F3E6DF',
    ink2: '#C0A599',
    ink3: '#8D7669',
    ink4: '#6D584D',
    scrim: 'rgba(0,0,0,0.6)',
  },
  categoryColors: {
    chicken: '#D9A23F',
    beef: '#C6472E',
    pork: '#E87A56',
    fish: '#5C97AC',
    veg: '#86A758',
    lamb: '#C4707C',
    other: '#C0A599',
  },
  tabBarBg: '#110A08',
};

// ── Fern — dark ────────────────────────────────────────────────────────────
// Soft warm fern green, more organic and muted than Emerald's jewel-bright.
const fern: Theme = {
  id: 'fern',
  name: 'Fern',
  mode: 'dark',
  colors: {
    bg: '#14150E',
    surface: '#1D1F16',
    surfaceWarm: '#23251A',
    chipBg: '#282A1E',
    border: '#333527',
    borderStrong: '#333527',
    accent: '#8FA75A',
    accentText: '#A3BC72',
    accentFg: '#191D0D',
    accentTint: '#2C301C',
    amber: '#CC9A44',
    amberText: '#DBB268',
    amberTint: '#362912',
    green: '#8FA75A',
    greenTint: '#2C301C',
    red: '#C4593F',
    redTint: '#331E17',
    ink: '#EBEEDD',
    ink2: '#B5BC99',
    ink3: '#868C6C',
    ink4: '#686C53',
    scrim: 'rgba(0,0,0,0.6)',
  },
  categoryColors: {
    chicken: '#CC9A44',
    beef: '#A5523A',
    pork: '#C7A17E',
    fish: '#5A8C93',
    veg: '#8FA75A',
    lamb: '#9C6F63',
    other: '#B5BC99',
  },
  tabBarBg: '#0F100A',
};

export const themes: Record<ThemeId, Theme> = {
  hearth,
  ember,
  seaglass,
  clay,
  risograph,
  matcha,
  blossom,
  citrus,
  lavender,
  newsprint,
  denim,
  aubergine,
  juniper,
  rosewater,
  peacock,
  moss,
  marigold,
  graphite,
  brick,
  coral,
  midnightKitchen,
  dusk,
  synthwave,
  terminal,
  bordeaux,
  abyss,
  espresso,
  sapphire,
  amethyst,
  emerald,
  garnet,
  lagoon,
  saffronDusk,
  mauve,
  onyx,
  coralReef,
  fern,
};

// Picker grid order (§4.10 step 1): default first, then the rest. Grouped by
// mode so the picker can render "Light" / "Dark" sections without re-sorting.
export const THEME_ORDER: ThemeId[] = [
  // Light
  'hearth',
  'ember',
  'seaglass',
  'clay',
  'risograph',
  'matcha',
  'blossom',
  'citrus',
  'lavender',
  'newsprint',
  'denim',
  'aubergine',
  'juniper',
  'rosewater',
  'peacock',
  'moss',
  'marigold',
  'graphite',
  'brick',
  'coral',
  // Dark
  'midnightKitchen',
  'dusk',
  'synthwave',
  'terminal',
  'bordeaux',
  'abyss',
  'espresso',
  'sapphire',
  'amethyst',
  'emerald',
  'garnet',
  'lagoon',
  'saffronDusk',
  'mauve',
  'onyx',
  'coralReef',
  'fern',
];

// The picker renders these as labelled sections (§4.10). Order within each
// follows THEME_ORDER.
export const LIGHT_THEME_IDS: ThemeId[] = THEME_ORDER.filter((id) => themes[id].mode === 'light');
export const DARK_THEME_IDS: ThemeId[] = THEME_ORDER.filter((id) => themes[id].mode === 'dark');
