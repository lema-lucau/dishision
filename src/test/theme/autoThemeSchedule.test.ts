import { describe, expect, it } from 'vitest';
import { isNightAt, nextBoundaryMs, parseHHMM, themeIdForTime } from '../../theme/autoThemeSchedule';

function at(h: number, m = 0): Date {
  const d = new Date(2026, 0, 1, h, m, 0, 0);
  return d;
}

describe('parseHHMM', () => {
  it('parses valid times to minutes past midnight', () => {
    expect(parseHHMM('08:00')).toBe(480);
    expect(parseHHMM('18:30')).toBe(1110);
    expect(parseHHMM('00:00')).toBe(0);
  });
  it('degrades bad input to 0 and clamps out-of-range', () => {
    expect(parseHHMM('nope')).toBe(0);
    expect(parseHHMM('99:99')).toBe(23 * 60 + 59);
  });
});

describe('isNightAt / themeIdForTime (wrap across midnight)', () => {
  const day = '08:00';
  const night = '18:00';
  it('is day between the day time and the night time', () => {
    expect(isNightAt(at(9), day, night)).toBe(false);
    expect(isNightAt(at(17, 59), day, night)).toBe(false);
    expect(themeIdForTime(at(12), day, night, 'sun', 'moon')).toBe('sun');
  });
  it('is night from the night time through midnight to the day time', () => {
    expect(isNightAt(at(18), day, night)).toBe(true);
    expect(isNightAt(at(23), day, night)).toBe(true);
    expect(isNightAt(at(2), day, night)).toBe(true);
    expect(isNightAt(at(7, 59), day, night)).toBe(true);
    expect(themeIdForTime(at(22), day, night, 'sun', 'moon')).toBe('moon');
    expect(themeIdForTime(at(6), day, night, 'sun', 'moon')).toBe('moon');
  });
  it('handles a night window that does not wrap (night before day, same day)', () => {
    // night 02:00 → day 08:00
    expect(isNightAt(at(3), '08:00', '02:00')).toBe(true);
    expect(isNightAt(at(1), '08:00', '02:00')).toBe(false);
    expect(isNightAt(at(9), '08:00', '02:00')).toBe(false);
  });
});

describe('nextBoundaryMs', () => {
  it('counts down to the soonest upcoming boundary', () => {
    // At 07:00, next boundary is day at 08:00 → 1 hour.
    expect(nextBoundaryMs(at(7), '08:00', '18:00')).toBe(60 * 60_000);
    // At 09:00, next boundary is night at 18:00 → 9 hours.
    expect(nextBoundaryMs(at(9), '08:00', '18:00')).toBe(9 * 60 * 60_000);
  });
  it('wraps to tomorrow when both boundaries are behind', () => {
    // At 20:00, next is day at 08:00 tomorrow → 12 hours.
    expect(nextBoundaryMs(at(20), '08:00', '18:00')).toBe(12 * 60 * 60_000);
  });
  it('always returns a positive delta', () => {
    expect(nextBoundaryMs(at(8), '08:00', '18:00')).toBeGreaterThan(0);
  });
});
