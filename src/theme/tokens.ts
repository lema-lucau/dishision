// Ember palette (§4.1) — the only place colour hex values may appear.
// Components read from `theme`, never a literal hex (§15).
export const colors = {
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

  red: '#C0392B',
  redTint: '#F8DCD7',

  ink: '#2A1F17',
  ink2: '#7E6A56',
  ink3: '#B0906B',
  ink4: '#C4A883',
} as const;

// Category colours (§4.2) — calendar dots, protein tags. Chosen for
// distinctness at small sizes, not realism.
export const categoryColors = {
  chicken: '#E8A33D',
  beef: '#A33B2A',
  pork: '#D6837E',
  fish: '#4A8CA8',
  veg: '#5C8A3C',
  lamb: '#8B4A5C',
  other: '#9B8264',
} as const;

export type CategoryKey = keyof typeof categoryColors;

// Typographic roles (§4.3). Font family names match the keys @expo-google-fonts
// exposes via useFonts — see src/theme/useAppFonts.ts.
export const fonts = {
  display: {
    semiBold: 'Fraunces_600SemiBold',
    bold: 'Fraunces_700Bold',
  },
  body: {
    regular: 'PublicSans_400Regular',
    medium: 'PublicSans_500Medium',
    semiBold: 'PublicSans_600SemiBold',
    bold: 'PublicSans_700Bold',
  },
  data: {
    medium: 'IBMPlexMono_500Medium',
    semiBold: 'IBMPlexMono_600SemiBold',
  },
} as const;

// Type scale (§4.4). Cooking Mode uses the 44 size for the dominant
// instruction line.
export const fontSize = {
  xs: 11,
  sm: 12.5,
  base: 14,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  cookingMode: 44,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 18,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  chip: 6,
  tile: 10,
  card: 13,
  pill: 20,
} as const;

export const theme = {
  colors,
  categoryColors,
  fonts,
  fontSize,
  spacing,
  radius,
} as const;

export type Theme = typeof theme;
