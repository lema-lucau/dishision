// Non-themed design tokens (§4.5–4.6). Type, scale, spacing, and radius are
// fixed across every theme — only colour is themed (see themes.ts). Colour now
// comes exclusively from `useTheme()` (src/theme/ThemeContext.tsx); there is no
// static colour export here any more, by design (§15 — a stray hex literal is a
// bug that only surfaces when someone switches theme).

// The seven meal/protein categories used by calendar dots and protein tags
// (§4.4). The key set is fixed here; the values are per-theme (themes.ts).
export type CategoryKey = 'chicken' | 'beef' | 'pork' | 'fish' | 'veg' | 'lamb' | 'other';

// Typographic roles (§4.5). Font family names match the keys @expo-google-fonts
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

// Type scale (§4.6). Cooking Mode uses the 44 size for the dominant
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

export type Fonts = typeof fonts;
export type FontSize = typeof fontSize;
export type Spacing = typeof spacing;
export type Radius = typeof radius;
