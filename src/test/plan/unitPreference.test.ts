import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { getUnitPreference, resetUnitPreference, setUnitPreference } from '../../plan/unitPreference';
import { createTestDb } from '../support/testDb';

async function insertIngredient(db: DbClient, packSize: number | null = 200): Promise<number> {
  const result = await db.runAsync('INSERT INTO canonical_ingredient (name, base_unit, pack_size, pack_label, source) VALUES (?, ?, ?, ?, ?)', [
    'Spinach',
    'g',
    packSize,
    'bag',
    'seed',
  ]);
  return result.lastInsertRowId;
}

describe('unitPreference (Pantry display-unit override)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('defaults to null (base_unit) when nothing is set', async () => {
    const id = await insertIngredient(db);
    expect(await getUnitPreference(db, id)).toBeNull();
  });

  it('persists a preference and reset deletes it', async () => {
    const id = await insertIngredient(db);
    await setUnitPreference(db, id, 'pack');
    expect(await getUnitPreference(db, id)).toBe('pack');

    await resetUnitPreference(db, id);
    expect(await getUnitPreference(db, id)).toBeNull();
  });

  it('setting again overwrites the previous preference', async () => {
    const id = await insertIngredient(db);
    await setUnitPreference(db, id, 'pack');
    await setUnitPreference(db, id, 'g');
    expect(await getUnitPreference(db, id)).toBe('g');
  });

  it('cascades away when the ingredient is deleted', async () => {
    const id = await insertIngredient(db);
    await setUnitPreference(db, id, 'pack');
    await db.runAsync('DELETE FROM canonical_ingredient WHERE id = ?', [id]);
    expect(await db.getFirstAsync('SELECT * FROM ingredient_unit_preference WHERE canonical_id = ?', [id])).toBeNull();
  });
});
