// §5.8 week view + day sheet read: planned_meal rows joined with their
// recipe, over an arbitrary [start, end] date range (inclusive).
import type { DbClient } from '../db/DbClient';

export interface PlannedMealEntry {
  id: number;
  recipeId: number;
  recipeName: string;
  photoEmoji: string;
  plannedDate: string;
  slot: string;
  plannedServings: number;
}

export async function loadPlannedRange(db: DbClient, rangeStart: string, rangeEnd: string): Promise<PlannedMealEntry[]> {
  const rows = await db.getAllAsync<{
    id: number;
    recipe_id: number;
    recipe_name: string;
    photo_emoji: string;
    planned_date: string;
    slot: string;
    planned_servings: number;
  }>(
    `SELECT pm.id, pm.recipe_id, r.name as recipe_name, r.photo_emoji, pm.planned_date, pm.slot, pm.planned_servings
     FROM planned_meal pm
     JOIN recipe r ON r.id = pm.recipe_id
     WHERE pm.planned_date >= ? AND pm.planned_date <= ?
     ORDER BY pm.planned_date, pm.slot`,
    [rangeStart, rangeEnd],
  );
  return rows.map((r) => ({
    id: r.id,
    recipeId: r.recipe_id,
    recipeName: r.recipe_name,
    photoEmoji: r.photo_emoji,
    plannedDate: r.planned_date,
    slot: r.slot,
    plannedServings: r.planned_servings,
  }));
}
