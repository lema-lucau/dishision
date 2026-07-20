// §6.2: "Exclude the same primary protein as yesterday's cook." When several
// meals were logged yesterday, the most recent one is treated as "yesterday's
// cook" — the spec's own phrasing is singular, and dinner is what this rule
// is really guarding against repeating.
import type { DbClient } from '../db/DbClient';

export async function getYesterdaysCookedRecipeId(db: DbClient, now: number): Promise<number | null> {
  const today = new Date(now);
  const yesterdayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const row = await db.getFirstAsync<{ recipe_id: number }>(
    `SELECT recipe_id FROM cook_log
     WHERE completed = 1 AND cooked_at >= ? AND cooked_at < ?
     ORDER BY cooked_at DESC LIMIT 1`,
    [yesterdayStart.toISOString(), todayStart.toISOString()],
  );
  return row?.recipe_id ?? null;
}
