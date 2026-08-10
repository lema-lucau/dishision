import { describe, expect, it } from 'vitest';
import {
  activeSymbol,
  clampActiveIndex,
  DEFAULT_SHORTLIST,
  formatCurrency,
  parseShortlist,
} from '../../lib/currency';

describe('formatCurrency (§5.10)', () => {
  it('prefixes the value with the given symbol and two decimal places', () => {
    expect(formatCurrency(4.2, '€')).toBe('€4.20');
    expect(formatCurrency(4.196, '€')).toBe('€4.20');
  });

  it('uses whatever symbol is passed, not a hardcoded default', () => {
    expect(formatCurrency(3.5, '$')).toBe('$3.50');
    expect(formatCurrency(3.5, '£')).toBe('£3.50');
  });
});

describe('currency shortlist (§G)', () => {
  it('defaults to the preloaded 5 when nothing is stored', () => {
    expect(parseShortlist(null)).toEqual(DEFAULT_SHORTLIST);
    expect(parseShortlist('not json')).toEqual(DEFAULT_SHORTLIST);
    expect(parseShortlist('[]')).toEqual(DEFAULT_SHORTLIST);
  });

  it('parses a valid shortlist and drops malformed entries', () => {
    const raw = JSON.stringify([
      { name: 'USD', symbol: '$' },
      { name: '', symbol: '£' },
      { name: 'JPY', symbol: '¥' },
      { nope: true },
    ]);
    expect(parseShortlist(raw)).toEqual([
      { name: 'USD', symbol: '$' },
      { name: 'JPY', symbol: '¥' },
    ]);
  });

  it('caps a parsed shortlist at 5 entries', () => {
    const raw = JSON.stringify(Array.from({ length: 8 }, (_, i) => ({ name: `C${i}`, symbol: `${i}` })));
    expect(parseShortlist(raw)).toHaveLength(5);
  });

  it('clamps the active index into bounds', () => {
    expect(clampActiveIndex(-1, 3)).toBe(0);
    expect(clampActiveIndex(5, 3)).toBe(2);
    expect(clampActiveIndex(NaN, 3)).toBe(0);
    expect(clampActiveIndex(1, 3)).toBe(1);
  });

  it('resolves the active symbol (write-through source)', () => {
    const shortlist = [
      { name: 'EUR', symbol: '€' },
      { name: 'GBP', symbol: '£' },
    ];
    expect(activeSymbol(shortlist, 1)).toBe('£');
    expect(activeSymbol(shortlist, 9)).toBe('£'); // clamped
    expect(activeSymbol([], 0)).toBe('€'); // falls back to default
  });
});
