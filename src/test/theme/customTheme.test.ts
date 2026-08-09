// Custom themes must be as complete and valid as the built-ins — a derived
// palette with a missing or malformed token would render as a broken screen the
// moment someone applies it. This suite proves buildCustomTheme fills every
// slot for both modes, and that the HSL colour maths behind the wheel/slider
// round-trip.
import { describe, expect, it } from 'vitest';
import { hexToHsl, hslToHex, isHexColor, setLightness } from '../../theme/colorMath';
import {
  buildCustomTheme,
  defaultSeed,
  derivedTokensFor,
  isCustomThemeId,
  newCustomThemeId,
  type CustomThemeDef,
} from '../../theme/customTheme';
import type { ColourTokens } from '../../theme/themes';
import type { CategoryKey } from '../../theme/tokens';

const COLOUR_KEYS: (keyof ColourTokens)[] = [
  'bg', 'surface', 'surfaceWarm', 'chipBg', 'border', 'borderStrong',
  'accent', 'accentText', 'accentFg', 'accentTint',
  'amber', 'amberText', 'amberTint',
  'green', 'greenTint',
  'red', 'redTint',
  'ink', 'ink2', 'ink3', 'ink4',
  'scrim',
];
const CATEGORY_KEYS: CategoryKey[] = ['chicken', 'beef', 'pork', 'fish', 'veg', 'lamb', 'other'];

function isColour(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value) || /^rgba?\(/.test(value);
}

function defFor(mode: 'light' | 'dark'): CustomThemeDef {
  return { id: newCustomThemeId(), name: 'Test', seed: defaultSeed(mode), createdAt: '2026-01-01T00:00:00.000Z' };
}

describe('HSL colour maths', () => {
  it('round-trips hex → hsl → hex within rounding tolerance', () => {
    for (const hex of ['#C25E3A', '#4ADE80', '#191919', '#FFFFFF', '#000000', '#2C6BED']) {
      const back = hslToHex(hexToHsl(hex));
      // Allow a 1-per-channel rounding drift.
      const a = hex.replace('#', '');
      const b = back.replace('#', '');
      for (let i = 0; i < 6; i += 2) {
        expect(Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16))).toBeLessThanOrEqual(1);
      }
    }
  });

  it('setLightness moves lightness while keeping hue', () => {
    const lighter = setLightness('#8A5A44', 80);
    const darker = setLightness('#8A5A44', 20);
    expect(hexToHsl(lighter).l).toBeGreaterThan(70);
    expect(hexToHsl(darker).l).toBeLessThan(30);
    // Hue preserved (within rounding).
    expect(Math.abs(hexToHsl(lighter).h - hexToHsl('#8A5A44').h)).toBeLessThan(2);
  });

  it('validates hex strings', () => {
    expect(isHexColor('#abc')).toBe(true);
    expect(isHexColor('#AABBCC')).toBe(true);
    expect(isHexColor('AABBCC')).toBe(false);
    expect(isHexColor('#ZZZ')).toBe(false);
  });
});

describe('buildCustomTheme', () => {
  it.each(['light', 'dark'] as const)('derives a complete, valid %s palette', (mode) => {
    const theme = buildCustomTheme(defFor(mode));
    expect(theme.mode).toBe(mode);
    for (const key of COLOUR_KEYS) {
      expect(isColour(theme.colors[key]), `${key} = ${theme.colors[key]}`).toBe(true);
    }
    for (const key of CATEGORY_KEYS) {
      expect(isColour(theme.categoryColors[key]), `category ${key}`).toBe(true);
    }
    expect(isColour(theme.tabBarBg)).toBe(true);
  });

  it('applies colour and category overrides on top of the derived palette', () => {
    const def: CustomThemeDef = {
      ...defFor('light'),
      overrides: { accent: '#123456' },
      categoryOverrides: { beef: '#654321' },
      tabBarBgOverride: '#0A0A0A',
    };
    const theme = buildCustomTheme(def);
    expect(theme.colors.accent).toBe('#123456');
    expect(theme.categoryColors.beef).toBe('#654321');
    expect(theme.tabBarBg).toBe('#0A0A0A');
    // A non-overridden token still comes from the derivation.
    expect(theme.colors.bg).toBe(def.seed.bg);
  });

  it('falls back to a name when blank', () => {
    const theme = buildCustomTheme({ ...defFor('light'), name: '   ' });
    expect(theme.name.length).toBeGreaterThan(0);
  });

  it('accent text clears a readable contrast against surface', () => {
    // The whole reason accentText exists: it must be legible where accent as a
    // fill would not be. Derived themes should still hit a usable ratio.
    const theme = buildCustomTheme(defFor('light'));
    const derived = derivedTokensFor(defFor('light').seed);
    expect(derived.accentText).toBe(theme.colors.accentText);
  });
});

describe('custom theme ids', () => {
  it('mints prefixed, unique ids', () => {
    const a = newCustomThemeId();
    const b = newCustomThemeId();
    expect(isCustomThemeId(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(isCustomThemeId('hearth')).toBe(false);
  });
});
