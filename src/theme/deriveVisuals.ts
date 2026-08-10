// The derived visual layer (redesign R2). One pure function turns a theme's
// existing ColourTokens into every new visual value the redesign needs —
// shadows, gradients, glow, photo scrim. No theme grows a hand-authored slot
// (base §4.2 is untouched) and no component writes a hex literal (base §15):
// components read `theme.elevation.card`, `theme.gradients.accent`, etc.
//
// Called exactly once per theme, inside ThemeContext.
import { darken, lighten, mix, withAlpha } from './colorMath';
import type { ColourTokens, ThemeMode } from './themes';

/** A shadow, in the shape RN wants it. `spread` has no RN equivalent, so the
 *  spec's negative spread is folded into a slightly tighter radius rather than
 *  faked with a second view — the visual difference at these sizes is nil. */
export interface ElevationTokens {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowRadius: number;
  shadowOpacity: number;
  elevation: number; // Android
}

export interface GradientSpec {
  colors: [string, string, ...string[]];
  start: { x: number; y: number };
  end: { x: number; y: number };
}

export interface VisualTokens {
  elevation: { e1: ElevationTokens; e2: ElevationTokens; e3: ElevationTokens };
  gradients: { accent: GradientSpec; accentSoft: GradientSpec; warmHero: GradientSpec };
  /** Colours for the two hand-rolled glow blobs (R2.3). Each is the blob's
   *  centre colour; GlowField fades it out through concentric rings. */
  glow: { warm: string; cool: string };
  /** Fixed values that must read on ANY photograph, in any theme (R2.4).
   *  The one sanctioned home for near-white/near-black literals. */
  onPhoto: {
    scrim: GradientSpec;
    ink: string;
    inkDim: string;
    chipBg: string;
    /** Ink for text sitting on the light `chipBg` chip — a fixed near-black so
     *  it reads in every theme mode (batch-2 A5). */
    chipInk: string;
    /** PhotoViewer's fixed backdrop (base §5.9, redesign R6.16.4). */
    viewerBg: string;
    /** QR quiet zone — pure white in every theme or scanners fail (R6.12.2). */
    qrQuietZone: string;
  };
}

// Direction vectors for the angles the spec names, in RN's unit-square coords.
const ANGLE_135 = { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } };
const ANGLE_160 = { start: { x: 0, y: 0 }, end: { x: 0.36, y: 1 } };
const ANGLE_165 = { start: { x: 0, y: 0 }, end: { x: 0.27, y: 1 } };

export function deriveVisuals(c: ColourTokens, mode: ThemeMode): VisualTokens {
  const dark = mode === 'dark';

  // Warm shadows on light grounds, neutral on dark (R2.1). `ink` is a warm
  // near-black in every light theme, so tinting from it is what stops a shadow
  // reading as dirty grey on Hearth's sand.
  const shadowColor = dark ? '#000000' : c.ink;
  const shadow = (offsetY: number, blur: number, spread: number, opacity: number): ElevationTokens => ({
    shadowColor,
    shadowOffset: { width: 0, height: Math.round(offsetY / 2) },
    shadowRadius: Math.max(2, Math.round((blur + spread) / 2)),
    shadowOpacity: opacity,
    elevation: 0, // filled in below
  });

  const e1 = { ...shadow(6, 16, -8, dark ? 0.22 : 0.1), elevation: 3 };
  const e2 = { ...shadow(14, 28, -16, dark ? 0.28 : 0.14), elevation: 8 };
  const e3 = { ...shadow(22, 40, -18, dark ? 0.3 : 0.16), elevation: 14 };

  return {
    elevation: { e1, e2, e3 },

    gradients: {
      accent: { colors: [c.accent, darken(c.accent, 0.14)], ...ANGLE_135 },
      accentSoft: { colors: [c.accentTint, mix(c.accentTint, c.surface, 0.4)], ...ANGLE_160 },
      warmHero: { colors: [c.bg, c.surfaceWarm, mix(c.amberTint, c.bg, 0.5)], ...ANGLE_165 },
    },

    // Dark grounds swallow a wash, so the alphas are unchanged by mode (R2.3)
    // — the same numbers read as a haze there and as soft light on a light
    // ground, which is exactly the intent.
    glow: {
      warm: withAlpha(c.amber, 0.34),
      cool: withAlpha(c.accent, 0.24),
    },

    onPhoto: {
      // A photograph is a photograph in every theme, so this scrim is fixed —
      // warm near-black up to 55% of the height, transparent above.
      scrim: {
        colors: ['rgba(24, 14, 8, 0)', 'rgba(24, 14, 8, 0.72)'],
        start: { x: 0.5, y: 0.45 },
        end: { x: 0.5, y: 1 },
      },
      ink: 'rgba(255, 255, 255, 0.98)',
      inkDim: 'rgba(255, 255, 255, 0.72)',
      chipBg: 'rgba(255, 246, 240, 0.92)',
      // Text/icon ink for content sitting ON the light `chipBg` chip. A warm
      // near-black so it reads in every theme mode — `colors.ink` is near-white
      // in dark themes and vanishes against the light chip (batch-2 A5).
      chipInk: 'rgba(26, 16, 10, 0.96)',
      viewerBg: '#0B0908',
      qrQuietZone: '#FFFFFF',
    },
  };
}

/** The category-tinted fallback tile behind a recipe with no photo (R4). Its
 *  own function because it takes a per-recipe colour, not just the theme. */
export function fallbackGradient(categoryColor: string, surfaceWarm: string, mode: ThemeMode): GradientSpec {
  // On dark themes the category colour is the bright element, so it leads;
  // on light themes it is tinted well back into the warm surface.
  const near = mode === 'dark' ? mix(categoryColor, surfaceWarm, 0.62) : mix(categoryColor, surfaceWarm, 0.78);
  const far = mode === 'dark' ? mix(categoryColor, surfaceWarm, 0.4) : mix(categoryColor, surfaceWarm, 0.55);
  return { colors: [near, far], start: { x: 0, y: 0 }, end: { x: 0.4, y: 1 } };
}

/** A tinted ground for an avatar/identity tile (R6.6): amber tint fading into
 *  the warm surface. Exported so Profile and Member profile share one look. */
export function identityGradient(c: ColourTokens): GradientSpec {
  return { colors: [c.amberTint, lighten(c.surfaceWarm, 0.15)], ...ANGLE_160 };
}
