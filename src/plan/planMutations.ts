// §5.8 planned_meal CRUD — the form-based planner (no drag-and-drop timeline
// editor per §1.2). Each row is one recipe on one date/slot; multiple meals
// per day are supported by just inserting more rows.
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';

export interface CreatePlannedMealInput {
  recipeId: number;
  plannedDate: string; // YYYY-MM-DD
  slot: string; // 'breakfast' | 'lunch' | 'dinner' | 'other'
  plannedServings: number;
}

export async function createPlannedMeal(db: DbClient, input: CreatePlannedMealInput): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO planned_meal (recipe_id, planned_date, slot, planned_servings) VALUES (?, ?, ?, ?)',
    [input.recipeId, input.plannedDate, input.slot, input.plannedServings],
  );
  logger.info('db', 'Planned meal created', { plannedMealId: result.lastInsertRowId, ...input });
  return result.lastInsertRowId;
}

export interface UpdatePlannedMealInput {
  recipeId?: number;
  plannedDate?: string;
  slot?: string;
  plannedServings?: number;
}

export async function updatePlannedMeal(db: DbClient, id: number, patch: UpdatePlannedMealInput): Promise<void> {
  const existing = await db.getFirstAsync<{
    recipe_id: number;
    planned_date: string;
    slot: string;
    planned_servings: number;
  }>('SELECT recipe_id, planned_date, slot, planned_servings FROM planned_meal WHERE id = ?', [id]);
  if (!existing) return;

  await db.runAsync(
    'UPDATE planned_meal SET recipe_id = ?, planned_date = ?, slot = ?, planned_servings = ? WHERE id = ?',
    [
      patch.recipeId ?? existing.recipe_id,
      patch.plannedDate ?? existing.planned_date,
      patch.slot ?? existing.slot,
      patch.plannedServings ?? existing.planned_servings,
      id,
    ],
  );
  logger.info('db', 'Planned meal updated', { plannedMealId: id, ...patch });
}

export async function deletePlannedMeal(db: DbClient, id: number): Promise<void> {
  await db.runAsync('DELETE FROM planned_meal WHERE id = ?', [id]);
  logger.info('db', 'Planned meal deleted', { plannedMealId: id });
}
