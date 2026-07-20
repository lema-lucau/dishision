import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { addRecipeToShoppingList, generateShoppingList } from '../../plan/shoppingListGeneration';
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

async function items(db: DbClient, listId: number) {
  return db.getAllAsync<{
    display_name: string;
    quantity: number;
    unit: string;
    recipe_id: number | null;
    recipe_name: string | null;
    is_common: number;
    buy_count: number;
  }>(
    'SELECT display_name, quantity, unit, recipe_id, recipe_name, is_common, buy_count FROM shopping_list_item WHERE list_id = ?',
    [listId],
  );
}

describe('generateShoppingList (§5.8, §3.5, sectioned by recipe)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('two different recipes needing the same ingredient at different quantities stay as separate per-recipe lines', async () => {
    const onionId = await insertIngredient(db, { name: 'Onion' });
    const recipeA = await insertRecipe(db, 'Curry');
    const recipeB = await insertRecipe(db, 'Stew');
    await insertIngredientLine(db, recipeA, onionId, 'Onion', 100);
    await insertIngredientLine(db, recipeB, onionId, 'Onion', 150);
    await plan(db, recipeA, '2026-07-20', 2);
    await plan(db, recipeB, '2026-07-21', 2);

    const { listId, itemCount } = await generateShoppingList(db, { rangeStart: '2026-07-20', rangeEnd: '2026-07-21' });
    expect(itemCount).toBe(2);
    const rows = await items(db, listId);
    expect(rows.every((r) => r.is_common === 0)).toBe(true);
    expect(rows.map((r) => r.recipe_name).sort()).toEqual(['Curry', 'Stew']);
    expect(rows.map((r) => r.quantity).sort((a, b) => a - b)).toEqual([100, 150]);
  });

  it('merges an exact-match ingredient across >=2 recipes into one "Common" line with a buy_count multiplier', async () => {
    const chickenId = await insertIngredient(db, { name: 'Chicken breast' });
    const recipeA = await insertRecipe(db, 'Fajitas');
    const recipeB = await insertRecipe(db, 'Stir fry');
    const recipeC = await insertRecipe(db, 'Katsu');
    await insertIngredientLine(db, recipeA, chickenId, 'Chicken breast', 400);
    await insertIngredientLine(db, recipeB, chickenId, 'Chicken breast', 400);
    await insertIngredientLine(db, recipeC, chickenId, 'Chicken breast', 400);
    await plan(db, recipeA, '2026-07-20', 2);
    await plan(db, recipeB, '2026-07-21', 2);
    await plan(db, recipeC, '2026-07-22', 2);

    const { listId, itemCount } = await generateShoppingList(db, { rangeStart: '2026-07-20', rangeEnd: '2026-07-22' });
    expect(itemCount).toBe(1);
    const [row] = await items(db, listId);
    expect(row).toMatchObject({ display_name: 'Chicken breast', quantity: 400, is_common: 1, buy_count: 3, recipe_id: null });
  });

  it('a recipe needing the same ingredient twice is summed within its own section first', async () => {
    const flourId = await insertIngredient(db, { name: 'Flour' });
    const recipeId = await insertRecipe(db, 'Bread');
    await insertIngredientLine(db, recipeId, flourId, 'Flour', 100);
    await insertIngredientLine(db, recipeId, flourId, 'Flour', 50);
    await plan(db, recipeId, '2026-07-20', 2);

    const { listId, itemCount } = await generateShoppingList(db, { rangeStart: '2026-07-20', rangeEnd: '2026-07-20' });
    expect(itemCount).toBe(1);
    const [row] = await items(db, listId);
    expect(row).toMatchObject({ quantity: 150, recipe_name: 'Bread', is_common: 0 });
  });

  it('pack-rounds a generated line up to whole packs', async () => {
    const flourId = await insertIngredient(db, { name: 'Flour', packSize: 200 });
    const recipeId = await insertRecipe(db, 'Bread');
    await insertIngredientLine(db, recipeId, flourId, 'Flour', 140);
    await plan(db, recipeId, '2026-07-20', 2);

    const { listId } = await generateShoppingList(db, { rangeStart: '2026-07-20', rangeEnd: '2026-07-20' });
    const [item] = await items(db, listId);
    expect(item.quantity).toBe(200); // ceil(140/200) = 1 pack
  });

  it('scales quantities to planned_servings before pack-rounding', async () => {
    const chickenId = await insertIngredient(db, { name: 'Chicken' });
    const recipeId = await insertRecipe(db, 'Roast', 2); // base servings 2
    await insertIngredientLine(db, recipeId, chickenId, 'Chicken', 200);
    await plan(db, recipeId, '2026-07-20', 4); // double the recipe

    const { listId } = await generateShoppingList(db, { rangeStart: '2026-07-20', rangeEnd: '2026-07-20' });
    const [item] = await items(db, listId);
    expect(item.quantity).toBe(400);
  });

  it('produces a different quantity for the same recipe planned at 1 vs 10 servings', async () => {
    const chickenId = await insertIngredient(db, { name: 'Chicken' });
    const recipeId = await insertRecipe(db, 'Roast', 2); // base servings 2
    await insertIngredientLine(db, recipeId, chickenId, 'Chicken', 200);

    await plan(db, recipeId, '2026-07-20', 1);
    const low = await generateShoppingList(db, { rangeStart: '2026-07-20', rangeEnd: '2026-07-20' });
    const [lowItem] = await items(db, low.listId);
    expect(lowItem.quantity).toBe(100);

    await db.runAsync('DELETE FROM planned_meal');
    await plan(db, recipeId, '2026-07-21', 10);
    const high = await generateShoppingList(db, { rangeStart: '2026-07-21', rangeEnd: '2026-07-21' });
    const [highItem] = await items(db, high.listId);
    expect(highItem.quantity).toBe(1000);
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

  it('passes through an unmeasured ingredient (no canonical match) under its recipe section', async () => {
    const recipeId = await insertRecipe(db, 'Grandma special');
    await insertIngredientLine(db, recipeId, null, 'A pinch of magic', 1, 'unit', 0);
    await plan(db, recipeId, '2026-07-20', 2);

    const { listId, itemCount } = await generateShoppingList(db, { rangeStart: '2026-07-20', rangeEnd: '2026-07-20' });
    expect(itemCount).toBe(1);
    const [item] = await items(db, listId);
    expect(item).toMatchObject({ display_name: 'A pinch of magic', recipe_name: 'Grandma special', is_common: 0 });
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

describe('addRecipeToShoppingList (recipe detail "Add to shopping list" button)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('scales ingredients to the chosen servings and attributes lines to the recipe', async () => {
    const chickenId = await insertIngredient(db, { name: 'Chicken' });
    const recipeId = await insertRecipe(db, 'Roast', 2);
    await insertIngredientLine(db, recipeId, chickenId, 'Chicken', 200);

    const { listId, itemCount } = await addRecipeToShoppingList(db, { recipeId, servings: 4 });
    expect(itemCount).toBe(1);
    const [row] = await items(db, listId);
    expect(row).toMatchObject({ display_name: 'Chicken', quantity: 400, recipe_name: 'Roast' });
  });

  it('appends to the existing open list rather than creating a new one', async () => {
    const onionId = await insertIngredient(db, { name: 'Onion' });
    const recipeId = await insertRecipe(db, 'Soup');
    await insertIngredientLine(db, recipeId, onionId, 'Onion', 100);
    await plan(db, recipeId, '2026-07-20', 2);
    const generated = await generateShoppingList(db, { rangeStart: '2026-07-20', rangeEnd: '2026-07-20' });

    const carrotId = await insertIngredient(db, { name: 'Carrot' });
    const recipeId2 = await insertRecipe(db, 'Stew');
    await insertIngredientLine(db, recipeId2, carrotId, 'Carrot', 150);

    const { listId } = await addRecipeToShoppingList(db, { recipeId: recipeId2, servings: 2 });
    expect(listId).toBe(generated.listId);
    const rows = await items(db, listId);
    expect(rows).toHaveLength(2);
  });

  it('merges into the existing unchecked line when the same recipe is added twice', async () => {
    const flourId = await insertIngredient(db, { name: 'Flour' });
    const recipeId = await insertRecipe(db, 'Bread', 2);
    await insertIngredientLine(db, recipeId, flourId, 'Flour', 100);

    const first = await addRecipeToShoppingList(db, { recipeId, servings: 2 });
    const second = await addRecipeToShoppingList(db, { recipeId, servings: 2 });
    expect(second.listId).toBe(first.listId);

    const rows = await items(db, first.listId);
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(200);
  });

  it('excludes staples unless running low, same as generation', async () => {
    const saltId = await insertIngredient(db, { name: 'Salt' });
    const recipeId = await insertRecipe(db, 'Soup');
    await insertIngredientLine(db, recipeId, saltId, 'Salt', 10);
    await db.runAsync('INSERT INTO staple (canonical_id, running_low) VALUES (?, 0)', [saltId]);

    const { itemCount } = await addRecipeToShoppingList(db, { recipeId, servings: 2 });
    expect(itemCount).toBe(0);
  });
});
