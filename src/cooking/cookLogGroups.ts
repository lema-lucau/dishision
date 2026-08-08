// §B4 "By Recipe" tab: cook logs aggregated per recipe. Like everything else in
// the cook log, the counts/averages are derived fresh from the rows on every
// read (§2.5), never stored.
import type { DbClient } from '../db/DbClient';

export interface RecipeCookGroup {
  recipeId: number;
  recipeName: string;
  photoEmoji: string;
  timesCooked: number;
  lastCookedAt: string;
  /** Mean of the rated cooks only; null when none of this recipe's cooks were rated. */
  avgStars: number | null;
}

export type CookGroupSort = 'mostCooked' | 'mostRecent' | 'highestRated';

// One row per recipe that has at least one completed cook. Sorting is applied by
// the caller so the sort control can re-order without another query.
export async function loadRecipeCookGroups(db: DbClient): Promise<RecipeCookGroup[]> {
  const rows = await db.getAllAsync<{
    recipe_id: number;
    name: string;
    photo_emoji: string;
    times_cooked: number;
    last_cooked_at: string;
    avg_stars: number | null;
  }>(
    `SELECT r.id AS recipe_id, r.name, r.photo_emoji,
            COUNT(*) AS times_cooked,
            MAX(cl.cooked_at) AS last_cooked_at,
            AVG(CASE WHEN cl.stars IS NOT NULL THEN cl.stars END) AS avg_stars
     FROM cook_log cl
     JOIN recipe r ON r.id = cl.recipe_id
     WHERE cl.completed = 1
     GROUP BY cl.recipe_id`,
  );
  return rows.map((r) => ({
    recipeId: r.recipe_id,
    recipeName: r.name,
    photoEmoji: r.photo_emoji,
    timesCooked: r.times_cooked,
    lastCookedAt: r.last_cooked_at,
    avgStars: r.avg_stars,
  }));
}

export function sortRecipeCookGroups(groups: RecipeCookGroup[], sort: CookGroupSort): RecipeCookGroup[] {
  const out = [...groups];
  switch (sort) {
    case 'mostCooked':
      out.sort((a, b) => b.timesCooked - a.timesCooked || b.lastCookedAt.localeCompare(a.lastCookedAt));
      break;
    case 'mostRecent':
      out.sort((a, b) => b.lastCookedAt.localeCompare(a.lastCookedAt));
      break;
    case 'highestRated':
      // Unrated recipes (avgStars null) sort to the bottom.
      out.sort((a, b) => (b.avgStars ?? -1) - (a.avgStars ?? -1) || b.timesCooked - a.timesCooked);
      break;
  }
  return out;
}
