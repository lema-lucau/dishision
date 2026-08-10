// §A1 automatic light/dark switch — pure scheduling maths, no timers or DB, so
// it's fully Vitest-testable. The user picks an explicit day theme and night
// theme plus the two switch times ("HH:MM", 24h). Night applies from the night
// time up to the day time, handling the wrap across midnight.

/** Minutes-past-midnight for an "HH:MM" string; NaN-safe (bad input → 0). */
export function parseHHMM(value: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return 0;
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return h * 60 + min;
}

function minutesOfDay(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

/** True when `now` falls in the night window [nightTime, dayTime). The window
 *  wraps midnight: if night is 18:00 and day is 08:00, night covers 18:00→08:00. */
export function isNightAt(now: Date, dayTime: string, nightTime: string): boolean {
  const day = parseHHMM(dayTime);
  const night = parseHHMM(nightTime);
  const cur = minutesOfDay(now);
  if (night === day) return false; // degenerate: no night window
  if (night < day) {
    // Night sits within the same day (e.g. 02:00 → 08:00).
    return cur >= night && cur < day;
  }
  // Night wraps past midnight (the common case, e.g. 18:00 → 08:00).
  return cur >= night || cur < day;
}

/** The theme id that should be active at `now`. */
export function themeIdForTime(now: Date, dayTime: string, nightTime: string, dayId: string, nightId: string): string {
  return isNightAt(now, dayTime, nightTime) ? nightId : dayId;
}

/** Milliseconds until the next switch boundary (day↔night), for arming a timer.
 *  Always > 0 so a re-armed timer can't spin. */
export function nextBoundaryMs(now: Date, dayTime: string, nightTime: string): number {
  const day = parseHHMM(dayTime);
  const night = parseHHMM(nightTime);
  const cur = now.getHours() * 60 + now.getMinutes();
  const curMs = cur * 60_000 + now.getSeconds() * 1000 + now.getMilliseconds();

  // Candidate boundaries in minutes-of-day; find the soonest strictly ahead,
  // wrapping to tomorrow if both are behind.
  const boundaries = [day, night];
  let bestDelta = Infinity;
  for (const b of boundaries) {
    const bMs = b * 60_000;
    let delta = bMs - curMs;
    if (delta <= 0) delta += 24 * 60 * 60_000; // next occurrence tomorrow
    if (delta < bestDelta) bestDelta = delta;
  }
  return bestDelta === Infinity ? 24 * 60 * 60_000 : bestDelta;
}
