import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { createUserIngredient, searchCanonicalIngredients } from '../../recipes/ingredientSearch';
import { createTestDb } from '../support/testDb';

describe('ingredient search + "add this ingredient" (§5.5)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
    await db.runAsync(`INSERT INTO canonical_ingredient (name, base_unit, source) VALUES ('Chicken thigh', 'g', 'seed')`);
    await db.runAsync(`INSERT INTO canonical_ingredient (name, base_unit, source) VALUES ('Coconut milk', 'ml', 'seed')`);
  });

  it('matches on canonical name', async () => {
    const results = await searchCanonicalIngredients(db, 'chicken');
    expect(results.map((r) => r.name)).toEqual(['Chicken thigh']);
  });

  it('matches on an alias when the canonical name differs', async () => {
    const chicken = await db.getFirstAsync<{ id: number }>(`SELECT id FROM canonical_ingredient WHERE name = 'Chicken thigh'`);
    await db.runAsync('INSERT INTO canonical_ingredient_alias (canonical_id, alias) VALUES (?, ?)', [chicken!.id, 'chicken thighs']);

    const results = await searchCanonicalIngredients(db, 'thighs');
    expect(results.map((r) => r.name)).toEqual(['Chicken thigh']);
  });

  it('returns nothing for a name with no canonical or alias match', async () => {
    const results = await searchCanonicalIngredients(db, 'dragon fruit');
    expect(results).toHaveLength(0);
  });

  it('"add this ingredient" creates a minimal user-sourced canonical row with null macros', async () => {
    const created = await createUserIngredient(db, 'Dragon fruit', 'g');
    expect(created.name).toBe('Dragon fruit');
    expect(created.baseUnit).toBe('g');

    const row = await db.getFirstAsync<{ source: string; kcal_per_100: number | null; cost_per_100: number | null }>(
      'SELECT source, kcal_per_100, cost_per_100 FROM canonical_ingredient WHERE id = ?',
      [created.id],
    );
    expect(row?.source).toBe('user');
    expect(row?.kcal_per_100).toBeNull();
    expect(row?.cost_per_100).toBeNull();

    // and it's immediately findable by subsequent searches
    const results = await searchCanonicalIngredients(db, 'dragon');
    expect(results.map((r) => r.name)).toContain('Dragon fruit');
  });
});
