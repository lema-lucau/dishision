import { describe, expect, it } from 'vitest';
import { formatMinSec } from '../../lib/formatDuration';

describe('formatMinSec (batch-2 B1 — compact m/s step display)', () => {
  it('reads 0 seconds as "0s"', () => {
    expect(formatMinSec(0)).toBe('0s');
  });
  it('reads a sub-minute value as seconds only', () => {
    expect(formatMinSec(45)).toBe('45s');
  });
  it('drops the seconds segment on a whole minute', () => {
    expect(formatMinSec(120)).toBe('2m');
  });
  it('shows minutes and seconds together', () => {
    expect(formatMinSec(150)).toBe('2m 30s');
  });
  it('shows whole hours compactly', () => {
    expect(formatMinSec(3600)).toBe('1h');
  });
});
