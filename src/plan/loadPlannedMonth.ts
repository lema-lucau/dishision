// §5.8 calendar "planned" layer (outline dots), coloured by category (§4.4).
// Mirrors loadCookedMonth's shape exactly — the calendar renders both layers
// independently, plan and reality never linked (§5.8).
import type { DbClient } from '../db/DbClient';
import { primaryProteinTag } from '../recipes/queryEngine';
import type { CategoryKey } from '../theme/tokens';

export interface PlannedDayEntry {
  plannedMealId: number;
  date: string; // YYYY-MM-DD
  recipeId: number;
  recipeName: string;
  photoEmoji: string;
  slot: string;
  category: CategoryKey;
}

// `year`/`month` are 1-indexed (month: 1-12) for readability at call sites.
export async function loadPlannedMonth(db: DbClient, year: number, month: number): Promise<PlannedDayEntry[]> {
  const rangeStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const rangeEndDate = new Date(year, month, 1); // first day of the following month
  const rangeEnd = rangeEndDate.toISOString().slice(0, 10);

  const rows = await db.getAllAsync<{
    id: number;
    recipe_id: number;
    recipe_name: string;
    photo_emoji: string;
    planned_date: string;
    slot: string;
  }>(
    `SELECT pm.id, pm.recipe_id, r.name as recipe_name, r.photo_emoji, pm.planned_date, pm.slot
     FROM planned_meal pm
     JOIN recipe r ON r.id = pm.recipe_id
     WHERE pm.planned_date >= ? AND pm.planned_date < ?
     ORDER BY pm.planned_date`,
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
    plannedMealId: r.id,
    date: r.planned_date,
    recipeId: r.recipe_id,
    recipeName: r.recipe_name,
    photoEmoji: r.photo_emoji,
    slot: r.slot,
    category: (primaryProteinTag(tagsByRecipe.get(r.recipe_id) ?? []) ?? 'other') as CategoryKey,
  }));
}
