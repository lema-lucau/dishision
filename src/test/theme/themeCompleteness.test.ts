// §11.2 token-completeness. TypeScript enforces `Record<ThemeId, Theme>` with
// a fully-required ColourTokens at compile time; this catches anyone who
// reaches for a cast, and guarantees a new theme can't ship a missing slot.
import { describe, expect, it } from 'vitest';
import { THEME_ORDER, themes, type ColourTokens, type Theme } from '../../theme/themes';

const COLOUR_KEYS: (keyof ColourTokens)[] = [
  'bg', 'surface', 'surfaceWarm', 'chipBg', 'border', 'borderStrong',
  'accent', 'accentText', 'accentFg', 'accentTint',
  'amber', 'amberText', 'amberTint',
  'green', 'greenTint',
  'red', 'redTint',
  'ink', 'ink2', 'ink3', 'ink4',
  'scrim',
];

const CATEGORY_KEYS = ['chicken', 'beef', 'pork', 'fish', 'veg', 'lamb', 'other'] as const;

const themeList = Object.values(themes);

function isColour(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value) || /^rgba?\(/.test(value);
}

describe('theme token completeness (§11.2)', () => {
  it('ships every theme in the roster', () => {
    expect(themeList).toHaveLength(7);
    expect(new Set(THEME_ORDER)).toEqual(new Set(Object.keys(themes)));
  });

  it.each(themeList.map((t): [string, Theme] => [t.name, t]))(
    '%s defines every colour token',
    (_name, theme) => {
      for (const key of COLOUR_KEYS) {
        expect(theme.colors[key], `${theme.id} missing colour "${key}"`).toBeDefined();
        expect(isColour(theme.colors[key]), `${theme.id}.${key} = "${theme.colors[key]}" is not a colour`).toBe(true);
      }
    },
  );

  it.each(themeList.map((t): [string, Theme] => [t.name, t]))(
    '%s defines every category colour + tabBarBg + mode',
    (_name, theme) => {
      for (const key of CATEGORY_KEYS) {
        expect(theme.categoryColors[key], `${theme.id} missing category "${key}"`).toBeDefined();
        expect(isColour(theme.categoryColors[key])).toBe(true);
      }
      expect(isColour(theme.tabBarBg)).toBe(true);
      expect(['light', 'dark']).toContain(theme.mode);
    },
  );
});
