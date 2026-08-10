import { describe, expect, it } from 'vitest';
import { formatDurationPrecise } from '../../lib/formatDuration';

describe('formatDurationPrecise (seconds-aware step durations)', () => {
  it('renders sub-minute values in seconds', () => {
    expect(formatDurationPrecise(0)).toBe('0 sec');
    expect(formatDurationPrecise(30)).toBe('30 sec');
    expect(formatDurationPrecise(59)).toBe('59 sec');
  });

  it('renders exact minutes without a seconds remainder', () => {
    expect(formatDurationPrecise(60)).toBe('1 min');
    expect(formatDurationPrecise(120)).toBe('2 min');
  });

  it('appends the seconds remainder under an hour', () => {
    expect(formatDurationPrecise(90)).toBe('1 min 30 sec');
    expect(formatDurationPrecise(155)).toBe('2 min 35 sec');
  });

  it('renders hours with minute/second remainders', () => {
    expect(formatDurationPrecise(3600)).toBe('1h');
    expect(formatDurationPrecise(3660)).toBe('1h 1m');
    expect(formatDurationPrecise(3930)).toBe('1h 5m 30s');
    expect(formatDurationPrecise(3630)).toBe('1h 30s');
  });

  it('rounds fractional and clamps negative input', () => {
    expect(formatDurationPrecise(29.6)).toBe('30 sec');
    expect(formatDurationPrecise(-10)).toBe('0 sec');
  });
});
