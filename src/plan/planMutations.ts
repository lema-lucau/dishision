// §5.8 planned_meal CRUD — the form-based planner (no drag-and-drop timeline
// editor per §1.2). Each row is one recipe on one date/slot; multiple meals
// per day are supported by just inserting more rows.
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { recipeName } from '../debug/logNames';

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
  logger.info('db', 'Planned meal created', { plannedMealId: result.lastInsertRowId, recipeName: await recipeName(db, input.recipeId), ...input });
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
  logger.info('db', 'Planned meal updated', { plannedMealId: id, recipeName: await recipeName(db, patch.recipeId ?? existing.recipe_id), ...patch });
}

export async function deletePlannedMeal(db: DbClient, id: number): Promise<void> {
  const existing = await db.getFirstAsync<{ recipe_id: number }>('SELECT recipe_id FROM planned_meal WHERE id = ?', [id]);
  await db.runAsync('DELETE FROM planned_meal WHERE id = ?', [id]);
  logger.info('db', 'Planned meal deleted', { plannedMealId: id, recipeName: await recipeName(db, existing?.recipe_id) });
}

// Bulk-clears every planned meal in a date range (the weekly planner's
// "Clear week" button) — same scope as deletePlannedMeal, just for a whole
// week at once instead of one row.
export async function clearWeekPlan(db: DbClient, weekStartKey: string, weekEndKey: string): Promise<number> {
  const result = await db.runAsync('DELETE FROM planned_meal WHERE planned_date >= ? AND planned_date <= ?', [
    weekStartKey,
    weekEndKey,
  ]);
  logger.info('db', 'Week plan cleared', { weekStartKey, weekEndKey, deleted: result.changes });
  return result.changes;
}
