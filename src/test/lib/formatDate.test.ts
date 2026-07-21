import { describe, expect, it } from 'vitest';
import { formatDayHeading, formatDMY } from '../../lib/formatDate';

describe('formatDMY (house date format — DD/MM/YYYY, never MM/DD)', () => {
  it('formats a YYYY-MM-DD date key', () => {
    expect(formatDMY('2026-07-20')).toBe('20/07/2026');
  });

  it('formats a full ISO instant', () => {
    expect(formatDMY('2026-01-05T19:30:00.000Z')).toBe('05/01/2026');
  });

  it('pads single-digit day and month', () => {
    expect(formatDMY('2026-03-04')).toBe('04/03/2026');
  });
});

describe('formatDayHeading', () => {
  it('produces "Weekday, DD/MM/YYYY"', () => {
    // 2026-07-20 is a Monday
    expect(formatDayHeading('2026-07-20')).toBe('Monday, 20/07/2026');
  });
});
