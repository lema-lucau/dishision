// The derived facts that turn Cook Complete from a form into an occasion
// (§5.7). Nothing here is stored (§2.5) — every figure is read fresh out of
// cook_log, same rule as counts, ratings and streaks everywhere else.
//
// The pure half is separated from the query half on purpose: streak and
// milestone-copy logic is exactly the sort of off-by-one-prone arithmetic that
// wants a unit test, and unit tests can't reach a native SQLite handle (§11.1).
import type { DbClient } from '../db/DbClient';
import { localDateKey } from '../lib/formatDate';

export interface CookMilestones {
  /** Including the cook being logged right now. */
  timesCooked: number;
  /** Consecutive calendar days with at least one cook, counting back from the cook's own day. */
  dayStreak: number;
  /** Cooks (any recipe) in the same calendar month as this one, including this one. */
  cooksThisMonth: number;
  /** Best star rating given to any cook in that month, or null if nothing was rated. */
  bestStarsThisMonth: number | null;
  /** The recipe has never been completed before. */
  firstTime: boolean;
}

function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localDateKey(d.getTime());
}

// Consecutive days ending at `todayKey`. `todayKey` counts as day one whether or
// not it's in `dateKeys` — the caller is logging a cook for that day, so it is
// cooked by definition, and a streak that only turns 1 after the write lands
// would read as a bug rather than a milestone.
export function computeDayStreak(dateKeys: Iterable<string>, todayKey: string): number {
  const days = new Set(dateKeys);
  let streak = 1;
  let cursor = addDays(todayKey, -1);
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

// The one line worth putting above the form, or null when this cook is
// unremarkable — an app that celebrates everything celebrates nothing. Ordered
// by how much the fact would actually please someone: a first cook, then a
// round number, then a streak worth keeping, then a personal best.
export function celebrationLine(
  milestones: CookMilestones,
  starsJustGiven: number | null,
): string | null {
  if (milestones.firstTime) return 'First time you’ve cooked this.';
  if (milestones.timesCooked % 10 === 0) return `That’s ${milestones.timesCooked} times you’ve made this.`;
  if (milestones.dayStreak >= 3) return `${milestones.dayStreak} days cooking in a row.`;
  if (
    starsJustGiven != null &&
    starsJustGiven >= 4 &&
    (milestones.bestStarsThisMonth == null || starsJustGiven >= milestones.bestStarsThisMonth)
  ) {
    return 'Your best-rated cook this month.';
  }
  if (milestones.timesCooked >= 5) return `One of your regulars — ${milestones.timesCooked} times now.`;
  return null;
}

export async function loadCookMilestones(
  db: DbClient,
  recipeId: number,
  cookedAtIso: string,
): Promise<CookMilestones> {
  const dayKey = cookedAtIso.slice(0, 10);
  const monthPrefix = dayKey.slice(0, 7);

  const priorForRecipe = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) AS c FROM cook_log WHERE completed = 1 AND recipe_id = ?',
    [recipeId],
  );
  const dayRows = await db.getAllAsync<{ day: string }>(
    "SELECT DISTINCT substr(cooked_at, 1, 10) AS day FROM cook_log WHERE completed = 1",
  );
  const monthRow = await db.getFirstAsync<{ c: number; best: number | null }>(
    "SELECT COUNT(*) AS c, MAX(stars) AS best FROM cook_log WHERE completed = 1 AND substr(cooked_at, 1, 7) = ?",
    [monthPrefix],
  );

  const priorCount = priorForRecipe?.c ?? 0;
  return {
    timesCooked: priorCount + 1,
    dayStreak: computeDayStreak(
      dayRows.map((r) => r.day),
      dayKey,
    ),
    cooksThisMonth: (monthRow?.c ?? 0) + 1,
    bestStarsThisMonth: monthRow?.best ?? null,
    firstTime: priorCount === 0,
  };
}
