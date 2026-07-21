import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { loadPantry, removePantryItem, removePantryItems, setPantryQuantity, setPantryQuantityInUnit } from '../../plan/pantryMutations';
import { addStaple } from '../../plan/staples';
import { createTestDb } from '../support/testDb';

async function insertIngredient(db: DbClient, name = 'Rice', packSize: number | null = null): Promise<number> {
  const result = await db.runAsync('INSERT INTO canonical_ingredient (name, base_unit, pack_size, pack_label, source) VALUES (?, ?, ?, ?, ?)', [
    name,
    'g',
    packSize,
    packSize != null ? 'bag' : null,
    'seed',
  ]);
  return result.lastInsertRowId;
}

describe('pantryMutations (§5.8)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('creates a row on first set and logs the delta as a manual movement', async () => {
    const riceId = await insertIngredient(db);
    await setPantryQuantity(db, riceId, 500);
    const row = await db.getFirstAsync<{ quantity: number }>('SELECT quantity FROM pantry_item WHERE canonical_id = ?', [riceId]);
    expect(row?.quantity).toBe(500);
    const movement = await db.getFirstAsync<{ delta: number; reason: string }>('SELECT delta, reason FROM pantry_movement WHERE canonical_id = ?', [
      riceId,
    ]);
    expect(movement).toMatchObject({ delta: 500, reason: 'manual' });
  });

  it('correcting an existing quantity logs only the delta', async () => {
    const riceId = await insertIngredient(db);
    await setPantryQuantity(db, riceId, 500);
    await setPantryQuantity(db, riceId, 300); // binned some
    const movements = await db.getAllAsync<{ delta: number }>('SELECT delta FROM pantry_movement WHERE canonical_id = ? ORDER BY id', [
      riceId,
    ]);
    expect(movements.map((m) => m.delta)).toEqual([500, -200]);
  });

  it('setting quantity to zero or below removes the row', async () => {
    const riceId = await insertIngredient(db);
    await setPantryQuantity(db, riceId, 500);
    await setPantryQuantity(db, riceId, 0);
    expect(await db.getFirstAsync('SELECT * FROM pantry_item WHERE canonical_id = ?', [riceId])).toBeNull();
  });

  it('removePantryItem deletes the row', async () => {
    const riceId = await insertIngredient(db);
    await setPantryQuantity(db, riceId, 500);
    await removePantryItem(db, riceId);
    expect(await db.getFirstAsync('SELECT * FROM pantry_item WHERE canonical_id = ?', [riceId])).toBeNull();
  });

  it('loadPantry flags staples', async () => {
    const riceId = await insertIngredient(db, 'Rice');
    await setPantryQuantity(db, riceId, 500);
    await addStaple(db, riceId);
    const [row] = await loadPantry(db);
    expect(row).toMatchObject({ canonicalId: riceId, quantity: 500, isStaple: true });
  });

  it('removePantryItems removes several rows at once', async () => {
    const riceId = await insertIngredient(db, 'Rice');
    const flourId = await insertIngredient(db, 'Flour');
    await setPantryQuantity(db, riceId, 500);
    await setPantryQuantity(db, flourId, 300);
    await removePantryItems(db, [riceId, flourId]);
    expect(await loadPantry(db)).toHaveLength(0);
  });

  it('setPantryQuantityInUnit converts a display-unit value to base units before writing', async () => {
    const spinachId = await insertIngredient(db, 'Spinach', 200);
    const ingredient = { canonicalId: spinachId, baseUnit: 'g' as const, packSize: 200, density: null };
    const ok = await setPantryQuantityInUnit(db, ingredient, 2.5, 'pack');
    expect(ok).toBe(true);
    const row = await db.getFirstAsync<{ quantity: number }>('SELECT quantity FROM pantry_item WHERE canonical_id = ?', [spinachId]);
    expect(row?.quantity).toBe(500);
  });

  it('setPantryQuantityInUnit returns false and writes nothing for an impossible conversion', async () => {
    const eggsId = await insertIngredient(db, 'Eggs');
    await db.runAsync('UPDATE canonical_ingredient SET base_unit = ? WHERE id = ?', ['unit', eggsId]);
    const ingredient = { canonicalId: eggsId, baseUnit: 'unit' as const, packSize: null, density: null };
    const ok = await setPantryQuantityInUnit(db, ingredient, 6, 'ml');
    expect(ok).toBe(false);
    expect(await db.getFirstAsync('SELECT * FROM pantry_item WHERE canonical_id = ?', [eggsId])).toBeNull();
  });
});
