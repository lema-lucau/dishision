// The derived visual layer (redesign R2, R9 step 1). The whole point of
// deriving these values centrally is that they can be proved correct for every
// theme without a renderer — so this suite runs the full roster, light and
// dark, and snapshots the output.
import { describe, expect, it } from 'vitest';
import { luminance, mix, parseColor, toHex, withAlpha } from '../../theme/colorMath';
import { deriveVisuals, fallbackGradient, identityGradient } from '../../theme/deriveVisuals';
import { themes } from '../../theme/themes';

const themeList = Object.values(themes);

function isColour(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/i.test(value) || /^rgba?\(/.test(value);
}

describe('colour maths', () => {
  it('parses both hex forms and rgba', () => {
    expect(parseColor('#FFF')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor('#C25E3A')).toEqual({ r: 194, g: 94, b: 58 });
    expect(parseColor('rgba(44,36,32,0.35)')).toEqual({ r: 44, g: 36, b: 32 });
  });

  it('refuses to guess at a malformed colour', () => {
    expect(() => parseColor('terracotta')).toThrow();
    expect(() => parseColor('#12345')).toThrow();
  });

  it('mixes toward the second colour and clamps the ratio', () => {
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mix('#000000', '#FFFFFF', 0)).toBe('#000000');
    expect(mix('#000000', '#FFFFFF', 5)).toBe('#FFFFFF');
  });

  it('round-trips through hex', () => {
    expect(toHex(parseColor('#C25E3A'))).toBe('#C25E3A');
  });

  it('writes alpha without losing the channels', () => {
    expect(withAlpha('#C25E3A', 0.34)).toBe('rgba(194, 94, 58, 0.34)');
  });

  it('orders luminance the way eyes do', () => {
    expect(luminance('#FFFFFF')).toBeGreaterThan(luminance('#808080'));
    expect(luminance('#808080')).toBeGreaterThan(luminance('#000000'));
  });
});

describe('deriveVisuals across every theme (§11.2, R9)', () => {
  it.each(themeList.map((t) => [t.id, t] as const))('%s derives a complete visual layer', (_id, theme) => {
    const v = deriveVisuals(theme.colors, theme.mode);

    // Elevation: three levels, ordered, with an Android counterpart.
    const levels = [v.elevation.e1, v.elevation.e2, v.elevation.e3];
    for (const level of levels) {
      expect(isColour(level.shadowColor)).toBe(true);
      expect(level.shadowOpacity).toBeGreaterThan(0);
      expect(level.shadowRadius).toBeGreaterThan(0);
      expect(level.elevation).toBeGreaterThan(0);
    }
    expect(levels.map((l) => l.elevation)).toEqual([3, 8, 14]);
    expect(v.elevation.e1.shadowOpacity).toBeLessThan(v.elevation.e2.shadowOpacity);
    expect(v.elevation.e2.shadowOpacity).toBeLessThan(v.elevation.e3.shadowOpacity);

    // Shadows are warm on light grounds and neutral on dark (R2.1).
    if (theme.mode === 'dark') {
      expect(v.elevation.e1.shadowColor).toBe('#000000');
      expect(v.elevation.e1.shadowOpacity).toBeGreaterThan(0.2);
    } else {
      expect(v.elevation.e1.shadowColor).toBe(theme.colors.ink);
    }

    // Gradients: every stop parses, and each has at least two.
    for (const gradient of Object.values(v.gradients)) {
      expect(gradient.colors.length).toBeGreaterThanOrEqual(2);
      gradient.colors.forEach((c) => expect(isColour(c)).toBe(true));
    }
    // The accent gradient darkens rather than drifting hue.
    expect(luminance(v.gradients.accent.colors[1])).toBeLessThan(luminance(v.gradients.accent.colors[0]));

    // Glow + on-photo values.
    expect(v.glow.warm).toMatch(/^rgba\(/);
    expect(v.glow.cool).toMatch(/^rgba\(/);
    expect(isColour(v.onPhoto.ink)).toBe(true);
    expect(isColour(v.onPhoto.chipBg)).toBe(true);
    expect(v.onPhoto.qrQuietZone).toBe('#FFFFFF'); // R6.12.2 — scanners, not taste
  });

  it('is pure — same input, same output', () => {
    const a = deriveVisuals(themes.hearth.colors, 'light');
    const b = deriveVisuals(themes.hearth.colors, 'light');
    expect(a).toEqual(b);
  });

  it('gives dark themes a heavier shadow than light ones', () => {
    const light = deriveVisuals(themes.hearth.colors, 'light');
    const dark = deriveVisuals(themes.midnightKitchen.colors, 'dark');
    expect(dark.elevation.e1.shadowOpacity).toBeGreaterThan(light.elevation.e1.shadowOpacity);
  });

  it('snapshots the whole derived layer for Hearth and Midnight Kitchen', () => {
    expect(deriveVisuals(themes.hearth.colors, 'light')).toMatchSnapshot('hearth');
    expect(deriveVisuals(themes.midnightKitchen.colors, 'dark')).toMatchSnapshot('midnightKitchen');
  });
});

describe('per-recipe derivations (R4)', () => {
  it.each(themeList.map((t) => [t.id, t] as const))('%s tints a fallback tile per category', (_id, theme) => {
    for (const category of Object.values(theme.categoryColors)) {
      const gradient = fallbackGradient(category, theme.colors.surfaceWarm, theme.mode);
      expect(gradient.colors).toHaveLength(2);
      gradient.colors.forEach((c) => expect(isColour(c)).toBe(true));
      // The tile must never be flat — the two stops have to differ, or it
      // reads as the grey box the redesign exists to kill.
      expect(gradient.colors[0]).not.toBe(gradient.colors[1]);
    }
  });

  it('builds an identity gradient from the theme', () => {
    const gradient = identityGradient(themes.hearth.colors);
    expect(gradient.colors[0]).toBe(themes.hearth.colors.amberTint);
    expect(isColour(gradient.colors[1])).toBe(true);
  });
});
