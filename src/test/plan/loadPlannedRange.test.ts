import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { loadPlannedRange } from '../../plan/loadPlannedRange';
import { createTestDb } from '../support/testDb';

async function insertRecipe(db: DbClient, name = 'Chilli'): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO recipe (share_id, name, photo_emoji, base_servings, timeline_mode, source) VALUES (?, ?, '🌶️', 2, 'sequential', 'manual')`,
    [`share-${name}`, name],
  );
  return result.lastInsertRowId;
}

describe('loadPlannedRange (§5.8 week view)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('returns meals within an inclusive date range, ordered by date then slot', async () => {
    const recipeId = await insertRecipe(db);
    await db.runAsync('INSERT INTO planned_meal (recipe_id, planned_date, slot, planned_servings) VALUES (?, ?, ?, ?)', [
      recipeId,
      '2026-07-22',
      'lunch',
      2,
    ]);
    await db.runAsync('INSERT INTO planned_meal (recipe_id, planned_date, slot, planned_servings) VALUES (?, ?, ?, ?)', [
      recipeId,
      '2026-07-20',
      'dinner',
      2,
    ]);
    await db.runAsync('INSERT INTO planned_meal (recipe_id, planned_date, slot, planned_servings) VALUES (?, ?, ?, ?)', [
      recipeId,
      '2026-07-27',
      'dinner',
      2,
    ]);

    const entries = await loadPlannedRange(db, '2026-07-20', '2026-07-26');
    expect(entries.map((e) => e.plannedDate)).toEqual(['2026-07-20', '2026-07-22']);
  });
});
