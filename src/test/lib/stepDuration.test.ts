import { describe, expect, it } from 'vitest';
import { combineMinutesSeconds, minutesPart, secondsPart } from '../../lib/stepDuration';

describe('minutesPart / secondsPart', () => {
  it('splits a seconds total into its parts', () => {
    expect(minutesPart(150)).toBe('2');
    expect(secondsPart(150)).toBe('30');
  });
  it('is blank for an unset value', () => {
    expect(minutesPart(undefined)).toBe('');
    expect(secondsPart(null)).toBe('');
  });
  it('reports zero minutes for a seconds-only step', () => {
    expect(minutesPart(45)).toBe('0');
    expect(secondsPart(45)).toBe('45');
  });
});

describe('combineMinutesSeconds', () => {
  it('combines mins and secs', () => {
    expect(combineMinutesSeconds('2', '30')).toBe(150);
  });
  it('treats a blank part as zero', () => {
    expect(combineMinutesSeconds('2', '')).toBe(120);
    expect(combineMinutesSeconds('', '45')).toBe(45);
  });
  it('returns undefined when both parts are blank', () => {
    expect(combineMinutesSeconds('', '')).toBeUndefined();
  });
  it('clamps seconds to 0–59 instead of rolling into minutes', () => {
    expect(combineMinutesSeconds('1', '90')).toBe(1 * 60 + 59);
  });
  it('ignores non-numeric input', () => {
    expect(combineMinutesSeconds('abc', '')).toBeUndefined();
    expect(combineMinutesSeconds('2', 'x')).toBe(120);
  });
});
