import { describe, expect, it } from 'vitest';
import { sortThemesByName } from '../../theme/sortThemes';

describe('sortThemesByName', () => {
  it('sorts by display name alphabetically', () => {
    const out = sortThemesByName([{ name: 'Zephyr' }, { name: 'Amber' }, { name: 'Hearth' }]);
    expect(out.map((t) => t.name)).toEqual(['Amber', 'Hearth', 'Zephyr']);
  });

  it('is case-insensitive', () => {
    const out = sortThemesByName([{ name: 'banana' }, { name: 'Apple' }, { name: 'cherry' }]);
    expect(out.map((t) => t.name)).toEqual(['Apple', 'banana', 'cherry']);
  });

  it('does not mutate the input', () => {
    const input = [{ name: 'B' }, { name: 'A' }];
    const out = sortThemesByName(input);
    expect(input.map((t) => t.name)).toEqual(['B', 'A']);
    expect(out.map((t) => t.name)).toEqual(['A', 'B']);
  });

  it('preserves extra fields on the objects', () => {
    const out = sortThemesByName([
      { id: 'z', name: 'Zed' },
      { id: 'a', name: 'Ada' },
    ]);
    expect(out.map((t) => t.id)).toEqual(['a', 'z']);
  });
});
