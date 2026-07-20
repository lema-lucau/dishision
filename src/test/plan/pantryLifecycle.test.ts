// §11.2 mandated integration test: buy 1 bag spinach (200g) → cook needing
// 80g → pantry = 120g. Exercises the full loop: generate a list, check it
// off (pantry += purchase quantity), then complete a cook that deducts the
// scaled recipe need from the same pantry row.
import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { completeCook } from '../../cooking/completeCook';
import { generateShoppingList } from '../../plan/shoppingListGeneration';
import { checkShoppingListItem } from '../../plan/shoppingListMutations';
import { createTestDb } from '../support/testDb';

describe('pantry lifecycle (§5.8, §11.2)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('buy 1 bag spinach (200g) -> cook needing 80g -> pantry = 120g', async () => {
    const spinachResult = await db.runAsync(
      'INSERT INTO canonical_ingredient (name, base_unit, pack_size, source) VALUES (?, ?, ?, ?)',
      ['Spinach', 'g', 200, 'seed'],
    );
    const spinachId = spinachResult.lastInsertRowId;

    const recipeResult = await db.runAsync(
      `INSERT INTO recipe (share_id, name, photo_emoji, base_servings, timeline_mode, source) VALUES (?, ?, '🍲', 2, 'sequential', 'manual')`,
      ['share-stew', 'Stew'],
    );
    const recipeId = recipeResult.lastInsertRowId;
    await db.runAsync(
      `INSERT INTO recipe_ingredient (recipe_id, canonical_id, display_name, quantity, unit, scalable, optional, sort_order)
       VALUES (?, ?, 'Spinach', 80, 'g', 1, 0, 0)`,
      [recipeId, spinachId],
    );
    await db.runAsync('INSERT INTO planned_meal (recipe_id, planned_date, slot, planned_servings) VALUES (?, ?, ?, ?)', [
      recipeId,
      '2026-07-20',
      'dinner',
      2, // matches base_servings — no scaling
    ]);

    const { listId } = await generateShoppingList(db, { rangeStart: '2026-07-20', rangeEnd: '2026-07-20' });
    // 80g needed, 200g pack -> pack-rounded to 1 pack (200g)
    const [item] = await db.getAllAsync<{ id: number; quantity: number }>('SELECT id, quantity FROM shopping_list_item WHERE list_id = ?', [
      listId,
    ]);
    expect(item.quantity).toBe(200);

    await checkShoppingListItem(db, item.id);
    const afterShopping = await db.getFirstAsync<{ quantity: number }>('SELECT quantity FROM pantry_item WHERE canonical_id = ?', [spinachId]);
    expect(afterShopping?.quantity).toBe(200);

    await completeCook(db, {
      recipeId,
      cookedAt: '2026-07-20T19:00:00.000Z',
      servingsMade: 2,
      servingsEaten: 2,
      stars: null,
    });

    const afterCook = await db.getFirstAsync<{ quantity: number }>('SELECT quantity FROM pantry_item WHERE canonical_id = ?', [spinachId]);
    expect(afterCook?.quantity).toBe(120);
  });
});
