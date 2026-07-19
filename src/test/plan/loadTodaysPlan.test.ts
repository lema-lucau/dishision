import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { loadTodaysPlan } from '../../plan/loadTodaysPlan';
import { createTestDb } from '../support/testDb';

const NOW = new Date('2026-07-19T18:00:00.000Z').getTime();

async function insertRecipe(db: DbClient, name = 'Chilli'): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO recipe (share_id, name, photo_emoji, base_servings, timeline_mode, source) VALUES (?, ?, '🌶️', 2, 'sequential', 'manual')`,
    [`share-${name}`, name],
  );
  return result.lastInsertRowId;
}

async function insertPlannedMeal(db: DbClient, recipeId: number, date: string, slot: string, servings = 2): Promise<void> {
  await db.runAsync('INSERT INTO planned_meal (recipe_id, planned_date, slot, planned_servings) VALUES (?, ?, ?, ?)', [
    recipeId,
    date,
    slot,
    servings,
  ]);
}

describe('loadTodaysPlan (§5.2)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('returns null when nothing is planned for today', async () => {
    expect(await loadTodaysPlan(db, NOW)).toBeNull();
  });

  it('returns today\'s single planned meal', async () => {
    const recipeId = await insertRecipe(db);
    await insertPlannedMeal(db, recipeId, '2026-07-19', 'dinner');
    const plan = await loadTodaysPlan(db, NOW);
    expect(plan).toMatchObject({ recipeId, slot: 'dinner', plannedServings: 2 });
  });

  it('ignores meals planned for other days', async () => {
    const recipeId = await insertRecipe(db);
    await insertPlannedMeal(db, recipeId, '2026-07-20', 'dinner');
    expect(await loadTodaysPlan(db, NOW)).toBeNull();
  });

  it('prefers dinner when multiple slots are planned for today', async () => {
    const lunchRecipe = await insertRecipe(db, 'Soup');
    const dinnerRecipe = await insertRecipe(db, 'Curry');
    await insertPlannedMeal(db, lunchRecipe, '2026-07-19', 'lunch');
    await insertPlannedMeal(db, dinnerRecipe, '2026-07-19', 'dinner');
    const plan = await loadTodaysPlan(db, NOW);
    expect(plan?.recipeId).toBe(dinnerRecipe);
  });
});
