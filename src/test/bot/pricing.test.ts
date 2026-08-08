import { describe, expect, it } from 'vitest';
import { estimateCostUsd, normalizeModel, rateFor, usdToEur } from '../../bot/pricing';

describe('pricing (§12)', () => {
  it('prices Haiku at $1/$5 per MTok', () => {
    // 1,000,000 input + 1,000,000 output = 1 + 5 = 6 USD.
    expect(estimateCostUsd('haiku', 1_000_000, 1_000_000)).toBeCloseTo(6, 6);
  });

  it('uses the Sonnet introductory rate before Sep 1 2026', () => {
    const at = new Date('2026-08-15T00:00:00Z');
    expect(rateFor('sonnet', at)).toEqual({ input: 2, output: 10 });
    expect(estimateCostUsd('sonnet', 1_000_000, 1_000_000, at)).toBeCloseTo(12, 6);
  });

  it('switches to the Sonnet standard rate from Sep 1 2026', () => {
    const at = new Date('2026-09-01T00:00:00Z');
    expect(rateFor('sonnet', at)).toEqual({ input: 3, output: 15 });
    expect(estimateCostUsd('sonnet', 1_000_000, 1_000_000, at)).toBeCloseTo(18, 6);
  });

  it('prices from a concrete model id string, not just the key', () => {
    expect(estimateCostUsd('claude-haiku-4-5-20251001', 500_000, 0)).toBeCloseTo(0.5, 6);
  });

  it('normalises model names, falling back to Haiku for unknowns', () => {
    expect(normalizeModel('claude-sonnet-5')).toBe('sonnet');
    expect(normalizeModel('claude-haiku-4-5-20251001')).toBe('haiku');
    expect(normalizeModel('something-else')).toBe('haiku');
  });

  it('converts USD→EUR with the conservative flat rate', () => {
    expect(usdToEur(10)).toBeCloseTo(9.5, 6);
  });
});
