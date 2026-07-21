import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import {
  addManualShoppingListItem,
  checkAllShoppingListItems,
  checkShoppingListItem,
  deleteShoppingListItem,
  reorderShoppingListSection,
  uncheckAllShoppingListItems,
  uncheckShoppingListItem,
  updateShoppingListItem,
} from '../../plan/shoppingListMutations';
import { createTestDb } from '../support/testDb';

async function insertIngredient(db: DbClient, name = 'Spinach', packSize: number | null = null): Promise<number> {
  const result = await db.runAsync('INSERT INTO canonical_ingredient (name, base_unit, pack_size, source) VALUES (?, ?, ?, ?)', [
    name,
    'g',
    packSize,
    'seed',
  ]);
  return result.lastInsertRowId;
}

async function makeList(db: DbClient): Promise<number> {
  const result = await db.runAsync('INSERT INTO shopping_list (name) VALUES (NULL)');
  return result.lastInsertRowId;
}

describe('shoppingListMutations (§5.8)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('checking off an item adds its (unit-converted) quantity to the pantry and writes a movement', async () => {
    const spinachId = await insertIngredient(db, 'Spinach', 200);
    const listId = await makeList(db);
    const itemId = await addManualShoppingListItem(db, listId, { displayName: 'Spinach', quantity: 200, unit: 'g', canonicalId: spinachId });

    await checkShoppingListItem(db, itemId);

    const pantry = await db.getFirstAsync<{ quantity: number }>('SELECT quantity FROM pantry_item WHERE canonical_id = ?', [spinachId]);
    expect(pantry?.quantity).toBe(200);
    const item = await db.getFirstAsync<{ checked: number }>('SELECT checked FROM shopping_list_item WHERE id = ?', [itemId]);
    expect(item?.checked).toBe(1);
    const movement = await db.getFirstAsync<{ delta: number; reason: string }>('SELECT delta, reason FROM pantry_movement WHERE canonical_id = ?', [
      spinachId,
    ]);
    expect(movement).toMatchObject({ delta: 200, reason: 'shopping' });
  });

  it('converts a non-base unit at check-off time', async () => {
    const oilId = await insertIngredient(db, 'Oil');
    await db.runAsync('UPDATE canonical_ingredient SET density = 0.92 WHERE id = ?', [oilId]);
    const listId = await makeList(db);
    // 2 tbsp -> 30ml -> 30 * 0.92 = 27.6g
    const itemId = await addManualShoppingListItem(db, listId, { displayName: 'Oil', quantity: 2, unit: 'tbsp', canonicalId: oilId });

    await checkShoppingListItem(db, itemId);
    const pantry = await db.getFirstAsync<{ quantity: number }>('SELECT quantity FROM pantry_item WHERE canonical_id = ?', [oilId]);
    expect(pantry?.quantity).toBeCloseTo(27.6, 5);
  });

  it('unchecking within the same list reverses the pantry addition', async () => {
    const spinachId = await insertIngredient(db, 'Spinach');
    const listId = await makeList(db);
    const itemId = await addManualShoppingListItem(db, listId, { displayName: 'Spinach', quantity: 200, unit: 'g', canonicalId: spinachId });

    await checkShoppingListItem(db, itemId);
    await uncheckShoppingListItem(db, itemId);

    const pantry = await db.getFirstAsync('SELECT quantity FROM pantry_item WHERE canonical_id = ?', [spinachId]);
    expect(pantry).toBeNull(); // fully reversed and deducted to zero -> row removed
    const item = await db.getFirstAsync<{ checked: number; checked_at: string | null }>(
      'SELECT checked, checked_at FROM shopping_list_item WHERE id = ?',
      [itemId],
    );
    expect(item).toMatchObject({ checked: 0, checked_at: null });
  });

  it('checking an item with no canonical link just checks it off, no pantry effect', async () => {
    const listId = await makeList(db);
    const itemId = await addManualShoppingListItem(db, listId, { displayName: 'Something odd', quantity: 1, unit: 'unit' });
    await checkShoppingListItem(db, itemId);
    const item = await db.getFirstAsync<{ checked: number }>('SELECT checked FROM shopping_list_item WHERE id = ?', [itemId]);
    expect(item?.checked).toBe(1);
    const movements = await db.getAllAsync('SELECT * FROM pantry_movement');
    expect(movements).toHaveLength(0);
  });

  it('capitalises manually-typed names at write time, matching the ingredient/tag convention', async () => {
    const listId = await makeList(db);
    const itemId = await addManualShoppingListItem(db, listId, { displayName: 'sourdough starter', quantity: 1, unit: 'unit' });
    const item = await db.getFirstAsync<{ display_name: string }>('SELECT display_name FROM shopping_list_item WHERE id = ?', [itemId]);
    expect(item?.display_name).toBe('Sourdough starter');

    await updateShoppingListItem(db, itemId, { displayName: 'rye starter' });
    const updated = await db.getFirstAsync<{ display_name: string }>('SELECT display_name FROM shopping_list_item WHERE id = ?', [itemId]);
    expect(updated?.display_name).toBe('Rye starter');
  });

  it('edits display name, quantity, and unit', async () => {
    const listId = await makeList(db);
    const itemId = await addManualShoppingListItem(db, listId, { displayName: 'Onion', quantity: 100, unit: 'g' });
    await updateShoppingListItem(db, itemId, { displayName: 'Red onion', quantity: 150, unit: 'g' });
    const item = await db.getFirstAsync<{ display_name: string; quantity: number }>(
      'SELECT display_name, quantity FROM shopping_list_item WHERE id = ?',
      [itemId],
    );
    expect(item).toMatchObject({ display_name: 'Red onion', quantity: 150 });
  });

  it('deletes an item', async () => {
    const listId = await makeList(db);
    const itemId = await addManualShoppingListItem(db, listId, { displayName: 'Onion', quantity: 100, unit: 'g' });
    await deleteShoppingListItem(db, itemId);
    expect(await db.getFirstAsync('SELECT id FROM shopping_list_item WHERE id = ?', [itemId])).toBeNull();
  });

  it('reorders a section by reassigning its own sort_order slots to the new id order', async () => {
    const listId = await makeList(db);
    const a = await addManualShoppingListItem(db, listId, { displayName: 'A', quantity: 1, unit: 'unit' });
    const b = await addManualShoppingListItem(db, listId, { displayName: 'B', quantity: 1, unit: 'unit' });
    const c = await addManualShoppingListItem(db, listId, { displayName: 'C', quantity: 1, unit: 'unit' });
    await reorderShoppingListSection(db, [c, a, b]);
    const rows = await db.getAllAsync<{ id: number }>('SELECT id FROM shopping_list_item WHERE list_id = ? ORDER BY sort_order', [listId]);
    expect(rows.map((r) => r.id)).toEqual([c, a, b]);
  });

  it('checking off an item with buy_count > 1 adds quantity x buy_count to the pantry', async () => {
    const chickenId = await insertIngredient(db, 'Chicken breast');
    const listId = await makeList(db);
    const itemId = await addManualShoppingListItem(db, listId, {
      displayName: 'Chicken breast',
      quantity: 400,
      unit: 'g',
      buyCount: 3,
      canonicalId: chickenId,
    });
    await checkShoppingListItem(db, itemId);
    const pantry = await db.getFirstAsync<{ quantity: number }>('SELECT quantity FROM pantry_item WHERE canonical_id = ?', [chickenId]);
    expect(pantry?.quantity).toBe(1200);

    await uncheckShoppingListItem(db, itemId);
    expect(await db.getFirstAsync('SELECT quantity FROM pantry_item WHERE canonical_id = ?', [chickenId])).toBeNull();
  });

  it('mark-all-checked and mark-all-unchecked toggle every item and its pantry effect', async () => {
    const onionId = await insertIngredient(db, 'Onion');
    const listId = await makeList(db);
    await addManualShoppingListItem(db, listId, { displayName: 'Onion', quantity: 100, unit: 'g', canonicalId: onionId });
    await addManualShoppingListItem(db, listId, { displayName: 'Other', quantity: 1, unit: 'unit' });

    await checkAllShoppingListItems(db, listId);
    const afterCheck = await db.getAllAsync<{ checked: number }>('SELECT checked FROM shopping_list_item WHERE list_id = ?', [listId]);
    expect(afterCheck.every((r) => r.checked === 1)).toBe(true);
    expect((await db.getFirstAsync<{ quantity: number }>('SELECT quantity FROM pantry_item WHERE canonical_id = ?', [onionId]))?.quantity).toBe(100);

    await uncheckAllShoppingListItems(db, listId);
    const afterUncheck = await db.getAllAsync<{ checked: number }>('SELECT checked FROM shopping_list_item WHERE list_id = ?', [listId]);
    expect(afterUncheck.every((r) => r.checked === 0)).toBe(true);
    expect(await db.getFirstAsync('SELECT quantity FROM pantry_item WHERE canonical_id = ?', [onionId])).toBeNull();
  });
});
