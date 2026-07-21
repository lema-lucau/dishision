import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { clearWeekPlan, createPlannedMeal, deletePlannedMeal, updatePlannedMeal } from '../../plan/planMutations';
import { createTestDb } from '../support/testDb';

async function insertRecipe(db: DbClient, name = 'Chilli'): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO recipe (share_id, name, photo_emoji, base_servings, timeline_mode, source) VALUES (?, ?, '🌶️', 2, 'sequential', 'manual')`,
    [`share-${name}`, name],
  );
  return result.lastInsertRowId;
}

describe('planMutations (§5.8 planned_meal CRUD)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('creates a planned meal', async () => {
    const recipeId = await insertRecipe(db);
    const id = await createPlannedMeal(db, { recipeId, plannedDate: '2026-07-20', slot: 'dinner', plannedServings: 4 });
    const row = await db.getFirstAsync<{ recipe_id: number; planned_date: string; slot: string; planned_servings: number }>(
      'SELECT recipe_id, planned_date, slot, planned_servings FROM planned_meal WHERE id = ?',
      [id],
    );
    expect(row).toMatchObject({ recipe_id: recipeId, planned_date: '2026-07-20', slot: 'dinner', planned_servings: 4 });
  });

  it('updates only the patched fields', async () => {
    const recipeId = await insertRecipe(db);
    const id = await createPlannedMeal(db, { recipeId, plannedDate: '2026-07-20', slot: 'dinner', plannedServings: 4 });
    await updatePlannedMeal(db, id, { plannedServings: 6 });
    const row = await db.getFirstAsync<{ planned_date: string; slot: string; planned_servings: number }>(
      'SELECT planned_date, slot, planned_servings FROM planned_meal WHERE id = ?',
      [id],
    );
    expect(row).toMatchObject({ planned_date: '2026-07-20', slot: 'dinner', planned_servings: 6 });
  });

  it('deletes a planned meal', async () => {
    const recipeId = await insertRecipe(db);
    const id = await createPlannedMeal(db, { recipeId, plannedDate: '2026-07-20', slot: 'dinner', plannedServings: 2 });
    await deletePlannedMeal(db, id);
    const row = await db.getFirstAsync('SELECT id FROM planned_meal WHERE id = ?', [id]);
    expect(row).toBeNull();
  });

  it('deleting the recipe cascades away its planned meals (FK pragma, §2.6)', async () => {
    const recipeId = await insertRecipe(db);
    const id = await createPlannedMeal(db, { recipeId, plannedDate: '2026-07-20', slot: 'dinner', plannedServings: 2 });
    await db.runAsync('DELETE FROM recipe WHERE id = ?', [recipeId]);
    const row = await db.getFirstAsync('SELECT id FROM planned_meal WHERE id = ?', [id]);
    expect(row).toBeNull();
  });

  it('clears every planned meal within a week, leaving meals outside it untouched', async () => {
    const recipeId = await insertRecipe(db);
    const inWeekA = await createPlannedMeal(db, { recipeId, plannedDate: '2026-07-20', slot: 'dinner', plannedServings: 2 });
    const inWeekB = await createPlannedMeal(db, { recipeId, plannedDate: '2026-07-24', slot: 'lunch', plannedServings: 2 });
    const outsideWeek = await createPlannedMeal(db, { recipeId, plannedDate: '2026-07-27', slot: 'dinner', plannedServings: 2 });

    const deleted = await clearWeekPlan(db, '2026-07-20', '2026-07-26');
    expect(deleted).toBe(2);
    expect(await db.getFirstAsync('SELECT id FROM planned_meal WHERE id = ?', [inWeekA])).toBeNull();
    expect(await db.getFirstAsync('SELECT id FROM planned_meal WHERE id = ?', [inWeekB])).toBeNull();
    expect(await db.getFirstAsync('SELECT id FROM planned_meal WHERE id = ?', [outsideWeek])).not.toBeNull();
  });
});
