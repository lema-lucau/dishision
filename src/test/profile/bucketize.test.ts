import { describe, expect, it } from 'vitest';
import { bucketize, granularityForWindow } from '../../profile/bucketize';

const NOW = new Date('2026-08-10T12:00:00'); // a Monday, local

interface Log { at: string; v: number | null }
const log = (at: string, v: number | null = 1): Log => ({ at, v });

function cooksSeries(items: Log[], windowDays: number | null) {
  return bucketize({
    items,
    windowDays,
    now: NOW,
    dateOf: (i) => i.at,
    valueOf: () => 1,
    aggregate: 'sum',
    emptyValue: 0,
  });
}

describe('granularityForWindow', () => {
  it('is per-day for windows ≤ 14 days', () => {
    expect(granularityForWindow(1)).toBe('day');
    expect(granularityForWindow(7)).toBe('day');
    expect(granularityForWindow(14)).toBe('day');
  });
  it('is per-week for 30/90 and All', () => {
    expect(granularityForWindow(30)).toBe('week');
    expect(granularityForWindow(90)).toBe('week');
    expect(granularityForWindow(null)).toBe('week');
  });
});

describe('bucketize', () => {
  it('produces one per-day bucket per day of a short window', () => {
    const series = cooksSeries([log('2026-08-10T09:00:00'), log('2026-08-10T20:00:00'), log('2026-08-08T09:00:00')], 7);
    expect(series).toHaveLength(7); // Aug 4..10 inclusive
    const byKey = Object.fromEntries(series.map((b) => [b.key, b.value]));
    expect(byKey['2026-08-10']).toBe(2); // two cooks summed
    expect(byKey['2026-08-08']).toBe(1);
    expect(byKey['2026-08-09']).toBe(0); // empty day is a real zero for counts
  });

  it('uses per-week buckets for a 30-day window', () => {
    const series = cooksSeries([log('2026-08-10T09:00:00'), log('2026-07-20T09:00:00')], 30);
    // All buckets are Monday keys.
    expect(series.every((b) => new Date(`${b.key}T00:00:00`).getDay() === 1)).toBe(true);
    expect(series.length).toBeGreaterThanOrEqual(4);
  });

  it('averages for rating-style series and leaves empty periods null', () => {
    const series = bucketize({
      items: [log('2026-08-10T09:00:00', 4), log('2026-08-10T20:00:00', 2), log('2026-08-09T09:00:00', 5)],
      windowDays: 7,
      now: NOW,
      dateOf: (i) => i.at,
      valueOf: (i) => i.v,
      aggregate: 'avg',
    });
    const byKey = Object.fromEntries(series.map((b) => [b.key, b.value]));
    expect(byKey['2026-08-10']).toBe(3); // (4+2)/2
    expect(byKey['2026-08-09']).toBe(5);
    expect(byKey['2026-08-08']).toBeNull(); // no data
  });

  it('spans from the earliest datum for All-time', () => {
    const series = cooksSeries([log('2026-07-06T09:00:00'), log('2026-08-10T09:00:00')], null);
    expect(series[0].key <= '2026-07-06').toBe(true);
    expect(series[series.length - 1].key).toBe('2026-08-10'); // current week Monday
  });

  it('handles an empty window without throwing', () => {
    const series = cooksSeries([], 1);
    expect(series).toHaveLength(1);
    expect(series[0].value).toBe(0);
  });
});
