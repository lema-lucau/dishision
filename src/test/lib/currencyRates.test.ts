import { describe, expect, it } from 'vitest';
import { convertCurrency, RATES_PER_EUR } from '../../lib/currencyRates';

describe('convertCurrency (§F2 static rates)', () => {
  it('is identity for same currency', () => {
    expect(convertCurrency(10, 'EUR', 'EUR')).toBe(10);
    expect(convertCurrency(42, 'USD', 'USD')).toBeCloseTo(42, 6);
  });

  it('converts via the EUR base', () => {
    // 100 EUR → USD at 1.08 per EUR.
    expect(convertCurrency(100, 'EUR', 'USD')).toBeCloseTo(108, 6);
    // 108 USD → EUR back to ~100.
    expect(convertCurrency(108, 'USD', 'EUR')).toBeCloseTo(100, 6);
  });

  it('derives a cross-rate through EUR', () => {
    const direct = convertCurrency(50, 'USD', 'GBP');
    const viaEur = (50 / RATES_PER_EUR.USD) * RATES_PER_EUR.GBP;
    expect(direct).toBeCloseTo(viaEur, 6);
  });

  it('round-trips within floating tolerance', () => {
    const there = convertCurrency(37.5, 'AUD', 'JPY')!;
    const back = convertCurrency(there, 'JPY', 'AUD')!;
    expect(back).toBeCloseTo(37.5, 6);
  });

  it('returns null for an unknown currency', () => {
    expect(convertCurrency(10, 'EUR', 'XYZ')).toBeNull();
    expect(convertCurrency(10, 'XYZ', 'EUR')).toBeNull();
  });
});
