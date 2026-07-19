import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { loadCookedMonth } from '../../plan/loadCookedMonth';
import { createTestDb } from '../support/testDb';

async function insertRecipeWithTag(db: DbClient, name: string, emoji: string, tagName: string | null): Promise<number> {
  const recipe = await db.runAsync(
    `INSERT INTO recipe (share_id, name, photo_emoji, base_servings, timeline_mode, source) VALUES (?, ?, ?, 2, 'sequential', 'manual')`,
    [`share-${name}`, name, emoji],
  );
  const recipeId = recipe.lastInsertRowId;
  if (tagName) {
    const tag = await db.runAsync(`INSERT INTO tag (name, type) VALUES (?, 'protein')`, [tagName]);
    await db.runAsync('INSERT INTO recipe_tag (recipe_id, tag_id) VALUES (?, ?)', [recipeId, tag.lastInsertRowId]);
  }
  return recipeId;
}

async function insertCookLog(db: DbClient, recipeId: number, cookedAt: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO cook_log (recipe_id, cooked_at, servings_made, servings_eaten) VALUES (?, ?, 2, 2)`,
    [recipeId, cookedAt],
  );
}

describe('loadCookedMonth (§5.8 cooked layer)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('only returns cooks within the requested month, categorised by primary protein tag', async () => {
    const chicken = await insertRecipeWithTag(db, 'Chicken Curry', '🍛', 'chicken');
    const untagged = await insertRecipeWithTag(db, 'Mystery Bake', '🍽️', null);

    await insertCookLog(db, chicken, '2026-07-05T18:00:00.000Z');
    await insertCookLog(db, untagged, '2026-07-20T18:00:00.000Z');
    await insertCookLog(db, chicken, '2026-06-30T18:00:00.000Z'); // previous month, excluded
    await insertCookLog(db, chicken, '2026-08-01T18:00:00.000Z'); // next month, excluded

    const entries = await loadCookedMonth(db, 2026, 7);
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.recipeId === chicken)?.category).toBe('chicken');
    expect(entries.find((e) => e.recipeId === untagged)?.category).toBe('other');
  });

  it('groups multiple cooks on the same day under the same date key', async () => {
    const recipeId = await insertRecipeWithTag(db, 'Fish Pie', '🐟', 'fish');
    await insertCookLog(db, recipeId, '2026-07-05T12:00:00.000Z');
    await insertCookLog(db, recipeId, '2026-07-05T19:00:00.000Z');

    const entries = await loadCookedMonth(db, 2026, 7);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.date === '2026-07-05')).toBe(true);
  });

  it('excludes incomplete cook_log rows', async () => {
    const recipeId = await insertRecipeWithTag(db, 'Chilli', '🌶️', 'beef');
    await db.runAsync(
      `INSERT INTO cook_log (recipe_id, cooked_at, servings_made, servings_eaten, completed) VALUES (?, ?, 2, 2, 0)`,
      [recipeId, '2026-07-05T18:00:00.000Z'],
    );
    const entries = await loadCookedMonth(db, 2026, 7);
    expect(entries).toHaveLength(0);
  });
});
