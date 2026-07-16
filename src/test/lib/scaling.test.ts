import { describe, expect, it } from 'vitest';
import { formatCountableRange, formatScaledQuantity, roundQuantity, scaleQuantity } from '../../lib/scaling';

describe('scaleQuantity (§3.4)', () => {
  it('scales proportionally when scalable', () => {
    expect(scaleQuantity(400, true, 2, 6)).toBe(1200);
  });

  it('passes through unchanged when not scalable', () => {
    expect(scaleQuantity(1, false, 2, 6)).toBe(1);
  });
});

describe('roundQuantity rounding branches (§3.4)', () => {
  it('rounds to 1 decimal under 10', () => {
    expect(roundQuantity(1.23)).toBeCloseTo(1.2);
    expect(roundQuantity(9.96)).toBeCloseTo(10.0);
  });

  it('rounds to nearest whole between 10 and 100', () => {
    expect(roundQuantity(10)).toBe(10);
    expect(roundQuantity(47.6)).toBe(48);
    expect(roundQuantity(100)).toBe(100);
  });

  it('rounds to nearest 5 over 100', () => {
    expect(roundQuantity(101)).toBe(100);
    expect(roundQuantity(103)).toBe(105);
    expect(roundQuantity(238)).toBe(240);
  });
});

describe('formatCountableRange (§3.4)', () => {
  it('passes integers through', () => {
    expect(formatCountableRange(2)).toBe('2');
  });

  it('renders a range for fractional countables', () => {
    expect(formatCountableRange(1.5)).toBe('1–2');
    expect(formatCountableRange(2.25)).toBe('2–3');
  });
});

describe('formatScaledQuantity', () => {
  it('uses the countable range for fractional unit quantities', () => {
    expect(formatScaledQuantity(1.5, 'unit')).toBe('1–2');
  });

  it('uses threshold rounding otherwise', () => {
    expect(formatScaledQuantity(238, 'g')).toBe('240');
  });
});
