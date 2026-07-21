// §5.8/§11.2: plan and cooked layers render independently on the same day —
// no linkage, a day can have both, either, or neither.
import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { loadCookedMonth } from '../../plan/loadCookedMonth';
import { loadPlannedMonth } from '../../plan/loadPlannedMonth';
import { createTestDb } from '../support/testDb';

async function insertRecipe(db: DbClient, name = 'Chilli'): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO recipe (share_id, name, photo_emoji, base_servings, timeline_mode, source) VALUES (?, ?, '🌶️', 2, 'sequential', 'manual')`,
    [`share-${name}`, name],
  );
  return result.lastInsertRowId;
}

describe('loadPlannedMonth (§5.8)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('returns planned meals within the month, independent of cook_log', async () => {
    const recipeId = await insertRecipe(db);
    await db.runAsync(
      'INSERT INTO planned_meal (recipe_id, planned_date, slot, planned_servings) VALUES (?, ?, ?, ?)',
      [recipeId, '2026-07-20', 'dinner', 2],
    );

    const planned = await loadPlannedMonth(db, 2026, 7);
    expect(planned).toHaveLength(1);
    expect(planned[0]).toMatchObject({ date: '2026-07-20', recipeId, slot: 'dinner' });

    const cooked = await loadCookedMonth(db, 2026, 7);
    expect(cooked).toHaveLength(0);
  });

  it('same day can carry both a planned and a cooked entry with no linkage between them', async () => {
    const recipeId = await insertRecipe(db);
    await db.runAsync(
      'INSERT INTO planned_meal (recipe_id, planned_date, slot, planned_servings) VALUES (?, ?, ?, ?)',
      [recipeId, '2026-07-20', 'dinner', 2],
    );
    await db.runAsync(
      `INSERT INTO cook_log (recipe_id, cooked_at, servings_made, servings_eaten, completed) VALUES (?, '2026-07-20T19:00:00.000Z', 2, 2, 1)`,
      [recipeId],
    );

    const planned = await loadPlannedMonth(db, 2026, 7);
    const cooked = await loadCookedMonth(db, 2026, 7);
    expect(planned).toHaveLength(1);
    expect(cooked).toHaveLength(1);
    expect(planned[0].date).toBe(cooked[0].date);
  });

  it('excludes planned meals outside the requested month', async () => {
    const recipeId = await insertRecipe(db);
    await db.runAsync(
      'INSERT INTO planned_meal (recipe_id, planned_date, slot, planned_servings) VALUES (?, ?, ?, ?)',
      [recipeId, '2026-08-01', 'dinner', 2],
    );
    expect(await loadPlannedMonth(db, 2026, 7)).toHaveLength(0);
  });
});
