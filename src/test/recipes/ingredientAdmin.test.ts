import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { createIngredient, deleteIngredient, loadIngredientsPage, loadRecipesUsingIngredient } from '../../recipes/ingredientAdmin';
import { createTestDb } from '../support/testDb';

async function insertIngredient(db: DbClient, name: string): Promise<number> {
  const result = await db.runAsync('INSERT INTO canonical_ingredient (name, base_unit, source) VALUES (?, ?, ?)', [name, 'g', 'seed']);
  return result.lastInsertRowId;
}

async function insertRecipeUsing(db: DbClient, name: string, canonicalId: number): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO recipe (share_id, name, photo_emoji, base_servings, timeline_mode, source) VALUES (?, ?, '🍛', 2, 'sequential', 'manual')`,
    [`share-${name}`, name],
  );
  const recipeId = result.lastInsertRowId;
  await db.runAsync(
    `INSERT INTO recipe_ingredient (recipe_id, canonical_id, display_name, quantity, unit, scalable, optional, sort_order)
     VALUES (?, ?, ?, 100, 'g', 1, 0, 0)`,
    [recipeId, canonicalId, name],
  );
  return recipeId;
}

describe('ingredientAdmin (Recipes tab -> All ingredients)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('paginates and reports a usage count per ingredient', async () => {
    const onionId = await insertIngredient(db, 'Onion');
    await insertIngredient(db, 'Garlic');
    await insertRecipeUsing(db, 'Curry', onionId);
    await insertRecipeUsing(db, 'Stew', onionId);

    const page = await loadIngredientsPage(db, { page: 1, pageSize: 1 });
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ name: 'Garlic', usageCount: 0 });

    const page2 = await loadIngredientsPage(db, { page: 2, pageSize: 1 });
    expect(page2.items[0]).toMatchObject({ name: 'Onion', usageCount: 2 });
  });

  it('filters by search', async () => {
    await insertIngredient(db, 'Onion');
    await insertIngredient(db, 'Garlic');
    const page = await loadIngredientsPage(db, { search: 'gar', page: 1, pageSize: 20 });
    expect(page.items.map((i) => i.name)).toEqual(['Garlic']);
  });

  it('lists the recipes an ingredient is used in', async () => {
    const onionId = await insertIngredient(db, 'Onion');
    await insertRecipeUsing(db, 'Curry', onionId);
    const recipes = await loadRecipesUsingIngredient(db, onionId);
    expect(recipes.map((r) => r.name)).toEqual(['Curry']);
  });

  it('deletes an unused ingredient', async () => {
    const garlicId = await insertIngredient(db, 'Garlic');
    await deleteIngredient(db, garlicId);
    expect(await db.getFirstAsync('SELECT id FROM canonical_ingredient WHERE id = ?', [garlicId])).toBeNull();
  });

  it('refuses to delete an ingredient still used by a recipe', async () => {
    const onionId = await insertIngredient(db, 'Onion');
    await insertRecipeUsing(db, 'Curry', onionId);
    await expect(deleteIngredient(db, onionId)).rejects.toThrow();
    expect(await db.getFirstAsync('SELECT id FROM canonical_ingredient WHERE id = ?', [onionId])).not.toBeNull();
  });

  it('sorts by usage count, respecting direction', async () => {
    const onionId = await insertIngredient(db, 'Onion');
    await insertIngredient(db, 'Garlic');
    await insertRecipeUsing(db, 'Curry', onionId);
    await insertRecipeUsing(db, 'Stew', onionId);

    const desc = await loadIngredientsPage(db, { page: 1, pageSize: 20, sort: 'usage', direction: 'desc' });
    expect(desc.items.map((i) => i.name)).toEqual(['Onion', 'Garlic']);

    const asc = await loadIngredientsPage(db, { page: 1, pageSize: 20, sort: 'usage', direction: 'asc' });
    expect(asc.items.map((i) => i.name)).toEqual(['Garlic', 'Onion']);
  });

  it('creates a fully-specified user ingredient', async () => {
    const id = await createIngredient(db, {
      name: 'smoked paprika',
      baseUnit: 'g',
      category: 'staple',
      packSize: 50,
      packLabel: 'jar',
    });
    const row = await db.getFirstAsync<{ name: string; source: string; category: string; pack_label: string }>(
      'SELECT name, source, category, pack_label FROM canonical_ingredient WHERE id = ?',
      [id],
    );
    expect(row).toMatchObject({ name: 'Smoked paprika', source: 'user', category: 'staple', pack_label: 'jar' });
  });
});
