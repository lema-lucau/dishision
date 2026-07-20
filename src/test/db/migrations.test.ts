import { describe, expect, it } from 'vitest';
import { createTestDb } from '../support/testDb';

const EXPECTED_TABLES = [
  'canonical_ingredient',
  'canonical_ingredient_alias',
  'tag',
  'recipe',
  'recipe_ingredient',
  'step_lane',
  'recipe_step',
  'recipe_tag',
  'cook_log',
  'leftover',
  'cook_log_tag',
  'cook_log_photo',
  'cook_log_substitution',
  'favourite',
  'recipe_exclusion',
  'planned_meal',
  'shopping_list',
  'shopping_list_item',
  'staple',
  'pantry_item',
  'pantry_movement',
  'cooking_session',
  'cooking_session_step',
  'setting',
  'profile',
  'household_member',
  'household_recipe_cache',
  'household_rating',
  'sync_event',
];

describe('migrations', () => {
  it('creates every table from §2.3', async () => {
    const db = await createTestDb();
    const rows = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    );
    const names = rows.map((r) => r.name);
    for (const table of EXPECTED_TABLES) {
      expect(names).toContain(table);
    }
  });

  it('sets PRAGMA user_version to the latest migration', async () => {
    const db = await createTestDb();
    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(row?.user_version).toBe(2);
  });

  it('is idempotent — running migrate again on an up-to-date db is a no-op', async () => {
    const db = await createTestDb();
    // A second createTestDb call runs the chain from scratch on a fresh
    // in-memory db; re-running migrate() against an already-current db
    // (same version) should apply nothing and not throw.
    const { migrate } = await import('../../db/migrate');
    const { migrations } = await import('../../db/migrations');
    await expect(migrate(db, migrations)).resolves.toBeUndefined();
  });

  it('enforces foreign_keys = ON — the pragma is actually set, not just intended', async () => {
    const db = await createTestDb();
    const row = await db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys');
    expect(row?.foreign_keys).toBe(1);
  });

  it('cascades deletes through recipe_ingredient, recipe_step, and cook_log', async () => {
    const db = await createTestDb();

    await db.runAsync(
      "INSERT INTO recipe (share_id, name) VALUES ('share-1', 'Test Curry')",
    );
    const recipe = await db.getFirstAsync<{ id: number }>(
      "SELECT id FROM recipe WHERE share_id = 'share-1'",
    );
    const recipeId = recipe!.id;

    await db.runAsync(
      'INSERT INTO recipe_ingredient (recipe_id, display_name, quantity, unit) VALUES (?, ?, ?, ?)',
      [recipeId, 'chicken thigh', 400, 'g'],
    );
    await db.runAsync(
      'INSERT INTO recipe_step (recipe_id, phase, instruction) VALUES (?, ?, ?)',
      [recipeId, 'cook', 'Fry until golden'],
    );
    await db.runAsync(
      "INSERT INTO cook_log (recipe_id, cooked_at, servings_made) VALUES (?, ?, ?)",
      [recipeId, '2026-07-16', 4],
    );
    const cookLog = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM cook_log WHERE recipe_id = ?',
      [recipeId],
    );
    await db.runAsync(
      'INSERT INTO leftover (cook_log_id, servings_remaining, expires_at) VALUES (?, ?, ?)',
      [cookLog!.id, 2, '2026-07-19'],
    );

    await db.runAsync('DELETE FROM recipe WHERE id = ?', [recipeId]);

    const ingredients = await db.getAllAsync('SELECT * FROM recipe_ingredient WHERE recipe_id = ?', [
      recipeId,
    ]);
    const steps = await db.getAllAsync('SELECT * FROM recipe_step WHERE recipe_id = ?', [recipeId]);
    const logs = await db.getAllAsync('SELECT * FROM cook_log WHERE recipe_id = ?', [recipeId]);
    const leftovers = await db.getAllAsync('SELECT * FROM leftover WHERE cook_log_id = ?', [
      cookLog!.id,
    ]);

    expect(ingredients).toHaveLength(0);
    expect(steps).toHaveLength(0);
    expect(logs).toHaveLength(0);
    expect(leftovers).toHaveLength(0);
  });
});
