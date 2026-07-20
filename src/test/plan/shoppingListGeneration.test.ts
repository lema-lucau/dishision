import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { generateShoppingList } from '../../plan/shoppingListGeneration';
import { createTestDb } from '../support/testDb';

async function insertIngredient(
  db: DbClient,
  overrides: Partial<{ name: string; baseUnit: string; packSize: number | null }> = {},
): Promise<number> {
  const { name = 'Onion', baseUnit = 'g', packSize = null } = overrides;
  const result = await db.runAsync('INSERT INTO canonical_ingredient (name, base_unit, pack_size, source) VALUES (?, ?, ?, ?)', [
    name,
    baseUnit,
    packSize,
    'seed',
  ]);
  return result.lastInsertRowId;
}

async function insertRecipe(db: DbClient, name: string, baseServings = 2): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO recipe (share_id, name, photo_emoji, base_servings, timeline_mode, source) VALUES (?, ?, '🍛', ?, 'sequential', 'manual')`,
    [`share-${name}`, name, baseServings],
  );
  return result.lastInsertRowId;
}

async function insertIngredientLine(
  db: DbClient,
  recipeId: number,
  canonicalId: number | null,
  displayName: string,
  quantity: number,
  unit = 'g',
  scalable = 1,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO recipe_ingredient (recipe_id, canonical_id, display_name, quantity, unit, scalable, optional, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
    [recipeId, canonicalId, displayName, quantity, unit, scalable],
  );
}

async function plan(db: DbClient, recipeId: number, date: string, servings: number): Promise<void> {
  await db.runAsync('INSERT INTO planned_meal (recipe_id, planned_date, slot, planned_servings) VALUES (?, ?, ?, ?)', [
    recipeId,
    date,
    'dinner',
    servings,
  ]);
}

describe('generateShoppingList (§5.8, §3.5)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('consolidates the same canonical ingredient across two recipes into one line', async () => {
    const onionId = await insertIngredient(db, { name: 'Onion' });
    const recipeA = await insertRecipe(db, 'Curry');
    const recipeB = await insertRecipe(db, 'Stew');
    await insertIngredientLine(db, recipeA, onionId, 'Onion', 100);
    await insertIngredientLine(db, recipeB, onionId, 'Onion', 150);
    await plan(db, recipeA, '2026-07-20', 2); // base servings 2, no scaling
    await plan(db, recipeB, '2026-07-21', 2);

    const { listId, itemCount } = await generateShoppingList(db, { rangeStart: '2026-07-20', rangeEnd: '2026-07-21' });
    expect(itemCount).toBe(1);
    const items = await db.getAllAsync<{ display_name: string; quantity: number; unit: string }>(
      'SELECT display_name, quantity, unit FROM shopping_list_item WHERE list_id = ?',
      [listId],
    );
    expect(items[0]).toMatchObject({ display_name: 'Onion', quantity: 250, unit: 'g' });
  });

  it('pack-rounds a generated line up to whole packs', async () => {
    const flourId = await insertIngredient(db, { name: 'Flour', packSize: 200 });
    const recipeId = await insertRecipe(db, 'Bread');
    await insertIngredientLine(db, recipeId, flourId, 'Flour', 140);
    await plan(db, recipeId, '2026-07-20', 2);

    const { listId } = await generateShoppingList(db, { rangeStart: '2026-07-20', rangeEnd: '2026-07-20' });
    const [item] = await db.getAllAsync<{ quantity: number }>('SELECT quantity FROM shopping_list_item WHERE list_id = ?', [listId]);
    expect(item.quantity).toBe(200); // ceil(140/200) = 1 pack
  });

  it('scales quantities to planned_servings before consolidating', async () => {
    const chickenId = await insertIngredient(db, { name: 'Chicken' });
    const recipeId = await insertRecipe(db, 'Roast', 2); // base servings 2
    await insertIngredientLine(db, recipeId, chickenId, 'Chicken', 200);
    await plan(db, recipeId, '2026-07-20', 4); // double the recipe

    const { listId } = await generateShoppingList(db, { rangeStart: '2026-07-20', rangeEnd: '2026-07-20' });
    const [item] = await db.getAllAsync<{ quantity: number }>('SELECT quantity FROM shopping_list_item WHERE list_id = ?', [listId]);
    expect(item.quantity).toBe(400);
  });

  it('excludes staples unless flagged running_low', async () => {
    const saltId = await insertIngredient(db, { name: 'Salt' });
    const recipeId = await insertRecipe(db, 'Soup');
    await insertIngredientLine(db, recipeId, saltId, 'Salt', 10);
    await plan(db, recipeId, '2026-07-20', 2);
    await db.runAsync('INSERT INTO staple (canonical_id, running_low) VALUES (?, 0)', [saltId]);

    const notLow = await generateShoppingList(db, { rangeStart: '2026-07-20', rangeEnd: '2026-07-20' });
    expect(notLow.itemCount).toBe(0);

    await db.runAsync('UPDATE staple SET running_low = 1 WHERE canonical_id = ?', [saltId]);
    const low = await generateShoppingList(db, { rangeStart: '2026-07-20', rangeEnd: '2026-07-20' });
    expect(low.itemCount).toBe(1);
  });

  it('passes through an unmeasured ingredient (no canonical match) as its own line', async () => {
    const recipeId = await insertRecipe(db, 'Grandma special');
    await insertIngredientLine(db, recipeId, null, 'A pinch of magic', 1, 'unit', 0);
    await plan(db, recipeId, '2026-07-20', 2);

    const { listId, itemCount } = await generateShoppingList(db, { rangeStart: '2026-07-20', rangeEnd: '2026-07-20' });
    expect(itemCount).toBe(1);
    const [item] = await db.getAllAsync<{ display_name: string; canonical_id: number | null }>(
      'SELECT display_name, canonical_id FROM shopping_list_item WHERE list_id = ?',
      [listId],
    );
    expect(item).toMatchObject({ display_name: 'A pinch of magic', canonical_id: null });
  });

  it('ignores planned meals outside the date range', async () => {
    const onionId = await insertIngredient(db, { name: 'Onion' });
    const recipeId = await insertRecipe(db, 'Curry');
    await insertIngredientLine(db, recipeId, onionId, 'Onion', 100);
    await plan(db, recipeId, '2026-08-01', 2);

    const { itemCount } = await generateShoppingList(db, { rangeStart: '2026-07-20', rangeEnd: '2026-07-26' });
    expect(itemCount).toBe(0);
  });

  it('generating again creates a brand-new list rather than mutating the previous one', async () => {
    const onionId = await insertIngredient(db, { name: 'Onion' });
    const recipeId = await insertRecipe(db, 'Curry');
    await insertIngredientLine(db, recipeId, onionId, 'Onion', 100);
    await plan(db, recipeId, '2026-07-20', 2);

    const first = await generateShoppingList(db, { rangeStart: '2026-07-20', rangeEnd: '2026-07-20' });
    // Edit the first list's item — regenerating must not touch it.
    await db.runAsync('UPDATE shopping_list_item SET display_name = ? WHERE list_id = ?', ['Red onion', first.listId]);

    const second = await generateShoppingList(db, { rangeStart: '2026-07-20', rangeEnd: '2026-07-20' });
    expect(second.listId).not.toBe(first.listId);

    const untouched = await db.getFirstAsync<{ display_name: string }>('SELECT display_name FROM shopping_list_item WHERE list_id = ?', [
      first.listId,
    ]);
    expect(untouched?.display_name).toBe('Red onion');
  });
});
