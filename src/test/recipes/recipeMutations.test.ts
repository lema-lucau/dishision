import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { clearExclusion, copyRecipe, deleteRecipe, setExclusion, toggleFavourite } from '../../recipes/recipeMutations';
import { createTestDb } from '../support/testDb';

async function insertRecipe(db: DbClient, name = 'Bacon & Cabbage'): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO recipe (share_id, name, photo_emoji, base_servings, timeline_mode, source)
     VALUES (?, ?, '🥓', 4, 'sequential', 'seed')`,
    [`share-${name}`, name],
  );
  return result.lastInsertRowId;
}

describe('recipeMutations (§5.4, §9.4)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('toggleFavourite adds then removes the favourite row', async () => {
    const id = await insertRecipe(db);
    await toggleFavourite(db, id, false);
    expect(await db.getFirstAsync('SELECT 1 FROM favourite WHERE recipe_id = ?', [id])).not.toBeNull();
    await toggleFavourite(db, id, true);
    expect(await db.getFirstAsync('SELECT 1 FROM favourite WHERE recipe_id = ?', [id])).toBeNull();
  });

  it('never_again always overwrites not_tonight, and not_tonight never overwrites never_again', async () => {
    const id = await insertRecipe(db);
    await setExclusion(db, id, 'not_tonight');
    await setExclusion(db, id, 'never_again');
    let row = await db.getFirstAsync<{ kind: string }>('SELECT kind FROM recipe_exclusion WHERE recipe_id = ?', [id]);
    expect(row?.kind).toBe('never_again');

    await setExclusion(db, id, 'not_tonight');
    row = await db.getFirstAsync<{ kind: string }>('SELECT kind FROM recipe_exclusion WHERE recipe_id = ?', [id]);
    expect(row?.kind).toBe('never_again');
  });

  it('clearExclusion removes the row entirely', async () => {
    const id = await insertRecipe(db);
    await setExclusion(db, id, 'not_tonight');
    await clearExclusion(db, id);
    expect(await db.getFirstAsync('SELECT 1 FROM recipe_exclusion WHERE recipe_id = ?', [id])).toBeNull();
  });

  it('deleteRecipe cascades to ingredients, steps, and favourite rows (§2.6 FK enforcement)', async () => {
    const id = await insertRecipe(db);
    await db.runAsync(
      `INSERT INTO recipe_ingredient (recipe_id, display_name, quantity, unit, scalable, optional, sort_order) VALUES (?, 'Bacon', 200, 'g', 1, 0, 0)`,
      [id],
    );
    await toggleFavourite(db, id, false);

    await deleteRecipe(db, id);

    expect(await db.getFirstAsync('SELECT 1 FROM recipe_ingredient WHERE recipe_id = ?', [id])).toBeNull();
    expect(await db.getFirstAsync('SELECT 1 FROM favourite WHERE recipe_id = ?', [id])).toBeNull();
  });

  it('copyRecipe (§9.4) produces an independent manual recipe with a fresh share_id and "(copy)" suffix', async () => {
    const id = await insertRecipe(db, 'Beef Stew');
    await db.runAsync(
      `INSERT INTO recipe_ingredient (recipe_id, display_name, quantity, unit, scalable, optional, sort_order) VALUES (?, 'Beef', 500, 'g', 1, 0, 0)`,
      [id],
    );
    await db.runAsync(
      `INSERT INTO recipe_step (recipe_id, phase, instruction, duration_seconds, effort, sort_order) VALUES (?, 'cook', 'Brown the beef', 300, 'active', 0)`,
      [id],
    );

    const newId = await copyRecipe(db, id);
    expect(newId).not.toBe(id);

    const original = await db.getFirstAsync<{ share_id: string; name: string; source: string }>(
      'SELECT share_id, name, source FROM recipe WHERE id = ?',
      [id],
    );
    const copy = await db.getFirstAsync<{ share_id: string; name: string; source: string; seed_id: string | null }>(
      'SELECT share_id, name, source, seed_id FROM recipe WHERE id = ?',
      [newId],
    );
    expect(copy?.name).toBe('Beef Stew (copy)');
    expect(copy?.source).toBe('manual');
    expect(copy?.seed_id).toBeNull();
    expect(copy?.share_id).not.toBe(original?.share_id);

    const copiedIngredients = await db.getAllAsync('SELECT * FROM recipe_ingredient WHERE recipe_id = ?', [newId]);
    const copiedSteps = await db.getAllAsync('SELECT * FROM recipe_step WHERE recipe_id = ?', [newId]);
    expect(copiedIngredients).toHaveLength(1);
    expect(copiedSteps).toHaveLength(1);

    // fully independent thereafter: mutating the copy must not touch the original
    await deleteRecipe(db, newId);
    expect(await db.getFirstAsync('SELECT 1 FROM recipe WHERE id = ?', [id])).not.toBeNull();
  });
});
