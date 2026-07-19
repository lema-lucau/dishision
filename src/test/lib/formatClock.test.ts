import { describe, expect, it } from 'vitest';
import { formatClock } from '../../lib/formatDuration';

describe('formatClock (Cooking Mode running timer)', () => {
  it('renders MM:SS under an hour', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(65)).toBe('01:05');
    expect(formatClock(3599)).toBe('59:59');
  });

  it('renders H:MM:SS at an hour or more', () => {
    expect(formatClock(3600)).toBe('1:00:00');
    expect(formatClock(3725)).toBe('1:02:05');
  });
});
