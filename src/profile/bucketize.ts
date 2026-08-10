// §F1 (batch-2) adaptive stat bucketing. The Stats page is driven by a window
// (1d/7d/14d/30d/90d/All); the series under it use per-DAY bars for short windows
// (≤14d) and per-WEEK bars otherwise, so a short window still shows something
// meaningful instead of one fat bar. Pure so the day/week boundaries are tested.
import { localDateKey } from '../lib/formatDate';

export type Granularity = 'day' | 'week';

export interface Bucket {
  key: string;
  label: string;
  /** null = no data in this bucket (renders as an empty bar). */
  value: number | null;
}

/** Per-day bars for a window of 14 days or fewer; per-week otherwise (and for
 *  All-time). */
export function granularityForWindow(windowDays: number | null): Granularity {
  return windowDays != null && windowDays <= 14 ? 'day' : 'week';
}

function mondayKey(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00`);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return localDateKey(d.getTime());
}

function addDaysKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localDateKey(d.getTime());
}

function shortLabel(key: string): string {
  return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** The inclusive start date-key of a window ending at `now`. Null window (All)
 *  returns null — callers span from the earliest datum instead. */
export function windowStartKey(windowDays: number | null, now: Date): string | null {
  if (windowDays == null) return null;
  return addDaysKey(localDateKey(now.getTime()), -(windowDays - 1));
}

export interface BucketizeArgs<T> {
  items: T[];
  windowDays: number | null;
  now: Date;
  /** ISO date/datetime for the item (only the date portion is used). */
  dateOf: (item: T) => string;
  /** The item's contribution, or null to skip it (e.g. no cost recorded). */
  valueOf: (item: T) => number | null;
  aggregate: 'sum' | 'avg';
  /** Value for a bucket with no contributing items. Default null (an empty bar).
   *  Pass 0 for count-style series where an empty period is a real zero. */
  emptyValue?: number | null;
}

/** Bucket `items` into an ordered day/week series spanning the window (or, for
 *  All-time, from the earliest item to now). */
export function bucketize<T>({
  items,
  windowDays,
  now,
  dateOf,
  valueOf,
  aggregate,
  emptyValue = null,
}: BucketizeArgs<T>): Bucket[] {
  const granularity = granularityForWindow(windowDays);
  const nowKey = localDateKey(now.getTime());

  let startKey = windowStartKey(windowDays, now);
  if (startKey == null) {
    const dates = items.map((it) => dateOf(it).slice(0, 10)).filter(Boolean).sort();
    startKey = dates[0] ?? nowKey;
  }

  const keys: string[] = [];
  if (granularity === 'day') {
    for (let k = startKey; k <= nowKey; k = addDaysKey(k, 1)) keys.push(k);
  } else {
    const endWk = mondayKey(nowKey);
    for (let wk = mondayKey(startKey); wk <= endWk; wk = addDaysKey(wk, 7)) keys.push(wk);
  }

  const bucketOf = (dateKey: string) => (granularity === 'day' ? dateKey : mondayKey(dateKey));
  const keySet = new Set(keys);
  const sums = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const it of items) {
    const b = bucketOf(dateOf(it).slice(0, 10));
    if (!keySet.has(b)) continue;
    const v = valueOf(it);
    if (v == null) continue;
    sums.set(b, (sums.get(b) ?? 0) + v);
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }

  return keys.map((key) => {
    const count = counts.get(key) ?? 0;
    let value: number | null;
    if (count === 0) value = aggregate === 'avg' ? null : emptyValue;
    else value = aggregate === 'avg' ? (sums.get(key) ?? 0) / count : sums.get(key) ?? 0;
    return { key, label: shortLabel(key), value };
  });
}
