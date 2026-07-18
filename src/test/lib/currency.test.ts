import { describe, expect, it } from 'vitest';
import { formatCurrency } from '../../lib/currency';

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
