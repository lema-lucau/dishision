// §5.8 calendar "cooked" layer (filled dots), coloured by category (§4.4).
// The planned-meal layer and the rest of the Plan tab are S11/S12 — this is
// deliberately just the read-only history layer pulled forward into S7
// per the spec's own session plan.
import type { DbClient } from '../db/DbClient';
import { primaryProteinTag } from '../recipes/queryEngine';
import type { CategoryKey } from '../theme/tokens';

export interface CookedDayEntry {
  cookLogId: number;
  date: string; // YYYY-MM-DD, local calendar day derived from cooked_at
  recipeId: number;
  recipeName: string;
  photoEmoji: string;
  cookedAt: string;
  category: CategoryKey;
}

// `year`/`month` are 1-indexed (month: 1-12) for readability at call sites.
export async function loadCookedMonth(db: DbClient, year: number, month: number): Promise<CookedDayEntry[]> {
  const rangeStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const rangeEndDate = new Date(year, month, 1); // first day of the following month
  const rangeEnd = rangeEndDate.toISOString().slice(0, 10);

  const rows = await db.getAllAsync<{
    id: number;
    recipe_id: number;
    recipe_name: string;
    photo_emoji: string;
    cooked_at: string;
  }>(
    `SELECT cl.id, cl.recipe_id, r.name as recipe_name, r.photo_emoji, cl.cooked_at
     FROM cook_log cl
     JOIN recipe r ON r.id = cl.recipe_id
     WHERE cl.completed = 1 AND date(cl.cooked_at) >= ? AND date(cl.cooked_at) < ?
     ORDER BY cl.cooked_at`,
    [rangeStart, rangeEnd],
  );

  const tagRows = await db.getAllAsync<{ recipe_id: number; name: string }>(
    `SELECT rt.recipe_id, t.name
     FROM recipe_tag rt JOIN tag t ON t.id = rt.tag_id
     WHERE rt.recipe_id IN (${rows.map(() => '?').join(',') || 'NULL'})`,
    rows.map((r) => r.recipe_id),
  );
  const tagsByRecipe = new Map<number, string[]>();
  for (const t of tagRows) {
    const list = tagsByRecipe.get(t.recipe_id) ?? [];
    list.push(t.name);
    tagsByRecipe.set(t.recipe_id, list);
  }

  return rows.map((r) => ({
    cookLogId: r.id,
    date: r.cooked_at.slice(0, 10),
    recipeId: r.recipe_id,
    recipeName: r.recipe_name,
    photoEmoji: r.photo_emoji,
    cookedAt: r.cooked_at,
    category: (primaryProteinTag(tagsByRecipe.get(r.recipe_id) ?? []) ?? 'other') as CategoryKey,
  }));
}
