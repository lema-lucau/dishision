import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { completeCook } from '../../cooking/completeCook';
import { createTestDb } from '../support/testDb';

async function setupRecipe(db: DbClient, baseServings = 2): Promise<{ recipeId: number; spinachId: number }> {
  const spinach = await db.runAsync(
    `INSERT INTO canonical_ingredient (name, base_unit, source) VALUES ('Spinach', 'g', 'seed')`,
  );
  const spinachId = spinach.lastInsertRowId;
  const recipe = await db.runAsync(
    `INSERT INTO recipe (share_id, name, photo_emoji, base_servings, timeline_mode, source) VALUES ('share-1', 'Curry', '🍛', ?, 'sequential', 'manual')`,
    [baseServings],
  );
  const recipeId = recipe.lastInsertRowId;
  await db.runAsync(
    `INSERT INTO recipe_ingredient (recipe_id, canonical_id, display_name, quantity, unit, scalable, optional, sort_order)
     VALUES (?, ?, 'Spinach', 80, 'g', 1, 0, 0)`,
    [recipeId, spinachId],
  );
  return { recipeId, spinachId };
}

describe('completeCook (§5.7) integration', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('pantry lifecycle: buy 200g, cook needing 80g -> pantry left at 120g, with a movement row', async () => {
    const { recipeId, spinachId } = await setupRecipe(db);
    await db.runAsync('INSERT INTO pantry_item (canonical_id, quantity) VALUES (?, 200)', [spinachId]);

    await completeCook(db, {
      recipeId,
      cookedAt: '2026-07-16T18:00:00.000Z',
      servingsMade: 2,
      servingsEaten: 2,
      stars: null,
    });

    const pantry = await db.getFirstAsync<{ quantity: number }>('SELECT quantity FROM pantry_item WHERE canonical_id = ?', [spinachId]);
    expect(pantry?.quantity).toBe(120);

    const movement = await db.getFirstAsync<{ delta: number; reason: string }>(
      'SELECT delta, reason FROM pantry_movement WHERE canonical_id = ?',
      [spinachId],
    );
    expect(movement?.delta).toBe(-80);
    expect(movement?.reason).toBe('cook');
  });

  it('real-shortfall rule: pantry had 30g, needed 80g -> shortfall added to shopping list', async () => {
    const { recipeId, spinachId } = await setupRecipe(db);
    await db.runAsync('INSERT INTO pantry_item (canonical_id, quantity) VALUES (?, 30)', [spinachId]);

    const result = await completeCook(db, {
      recipeId,
      cookedAt: '2026-07-16T18:00:00.000Z',
      servingsMade: 2,
      servingsEaten: 2,
      stars: null,
    });

    expect(result.shortfalls).toHaveLength(1);
    expect(result.shortfalls[0].amount).toBe(50);

    // pantry row is fully consumed, so it's deleted rather than left at a negative/zero row
    const pantry = await db.getFirstAsync('SELECT 1 FROM pantry_item WHERE canonical_id = ?', [spinachId]);
    expect(pantry).toBeNull();

    const shoppingItem = await db.getFirstAsync<{ quantity: number; manual: number }>(
      'SELECT quantity, manual FROM shopping_list_item WHERE canonical_id = ?',
      [spinachId],
    );
    expect(shoppingItem?.quantity).toBe(50);
    expect(shoppingItem?.manual).toBe(1);
  });

  it('the pantry never knowing about an ingredient is not a shortfall — nothing is added to the shopping list', async () => {
    const { recipeId } = await setupRecipe(db);
    // no pantry_item row for spinach at all

    const result = await completeCook(db, {
      recipeId,
      cookedAt: '2026-07-16T18:00:00.000Z',
      servingsMade: 2,
      servingsEaten: 2,
      stars: null,
    });

    expect(result.shortfalls).toHaveLength(0);
    const shoppingItems = await db.getAllAsync('SELECT * FROM shopping_list_item');
    expect(shoppingItems).toHaveLength(0);
  });

  it('auto_add_shortfalls=off still reports the shortfall but does not insert a shopping line', async () => {
    const { recipeId, spinachId } = await setupRecipe(db);
    await db.runAsync('INSERT INTO pantry_item (canonical_id, quantity) VALUES (?, 30)', [spinachId]);
    await db.runAsync(`INSERT INTO setting (key, value) VALUES ('auto_add_shortfalls', '0')`);

    const result = await completeCook(db, {
      recipeId,
      cookedAt: '2026-07-16T18:00:00.000Z',
      servingsMade: 2,
      servingsEaten: 2,
      stars: null,
    });

    expect(result.shortfalls).toHaveLength(1);
    const shoppingItems = await db.getAllAsync('SELECT * FROM shopping_list_item');
    expect(shoppingItems).toHaveLength(0);
  });

  it('creates a leftover when made > eaten', async () => {
    const { recipeId, spinachId } = await setupRecipe(db);
    await db.runAsync('INSERT INTO pantry_item (canonical_id, quantity) VALUES (?, 1000)', [spinachId]);

    const result = await completeCook(db, {
      recipeId,
      cookedAt: '2026-07-16T18:00:00.000Z',
      servingsMade: 4,
      servingsEaten: 2,
      stars: 4,
    });

    expect(result.leftoverId).not.toBeNull();
    const leftover = await db.getFirstAsync<{ servings_remaining: number }>('SELECT servings_remaining FROM leftover WHERE id = ?', [
      result.leftoverId,
    ]);
    expect(leftover?.servings_remaining).toBe(2);
  });

  it('no leftover row when made === eaten', async () => {
    const { recipeId, spinachId } = await setupRecipe(db);
    await db.runAsync('INSERT INTO pantry_item (canonical_id, quantity) VALUES (?, 1000)', [spinachId]);

    const result = await completeCook(db, {
      recipeId,
      cookedAt: '2026-07-16T18:00:00.000Z',
      servingsMade: 2,
      servingsEaten: 2,
      stars: null,
    });

    expect(result.leftoverId).toBeNull();
  });
});
