// §5.8 shopping list editing + check-off. "Fully editable": edit qty/unit/
// name, delete, reorder, add manual. Checking an item off adds the purchase
// quantity to the pantry (unit-converted, §3.2) and writes a pantry_movement
// row; unchecking within the same list reverses exactly that.
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { capitalize } from '../lib/capitalize';
import { convertToBaseUnit } from '../lib/units';
import type { BaseUnit, RecipeUnit } from '../seed/types';

export interface AddManualItemInput {
  displayName: string;
  quantity: number;
  unit: RecipeUnit | BaseUnit;
  canonicalId?: number | null;
}

export async function addManualShoppingListItem(db: DbClient, listId: number, input: AddManualItemInput): Promise<number> {
  const maxSort = await db.getFirstAsync<{ max_sort: number | null }>(
    'SELECT MAX(sort_order) as max_sort FROM shopping_list_item WHERE list_id = ?',
    [listId],
  );
  const sortOrder = (maxSort?.max_sort ?? -1) + 1;
  const result = await db.runAsync(
    `INSERT INTO shopping_list_item (list_id, canonical_id, display_name, quantity, unit, manual, sort_order)
     VALUES (?, ?, ?, ?, ?, 1, ?)`,
    [listId, input.canonicalId ?? null, capitalize(input.displayName.trim()), input.quantity, input.unit, sortOrder],
  );
  logger.info('db', 'Manual shopping list item added', { listId, itemId: result.lastInsertRowId });
  return result.lastInsertRowId;
}

export interface UpdateShoppingListItemInput {
  displayName?: string;
  quantity?: number;
  unit?: RecipeUnit | BaseUnit;
}

export async function updateShoppingListItem(db: DbClient, itemId: number, patch: UpdateShoppingListItemInput): Promise<void> {
  const existing = await db.getFirstAsync<{ display_name: string; quantity: number; unit: string }>(
    'SELECT display_name, quantity, unit FROM shopping_list_item WHERE id = ?',
    [itemId],
  );
  if (!existing) return;
  await db.runAsync('UPDATE shopping_list_item SET display_name = ?, quantity = ?, unit = ? WHERE id = ?', [
    patch.displayName != null ? capitalize(patch.displayName.trim()) : existing.display_name,
    patch.quantity ?? existing.quantity,
    patch.unit ?? existing.unit,
    itemId,
  ]);
}

export async function deleteShoppingListItem(db: DbClient, itemId: number): Promise<void> {
  await db.runAsync('DELETE FROM shopping_list_item WHERE id = ?', [itemId]);
}

// Up/down reorder — same swap-with-neighbour convention as the recipe
// form's ingredient/step reordering, just persisted to sort_order directly.
export async function reorderShoppingListItem(db: DbClient, listId: number, itemId: number, delta: number): Promise<void> {
  const items = await db.getAllAsync<{ id: number; sort_order: number }>(
    'SELECT id, sort_order FROM shopping_list_item WHERE list_id = ? ORDER BY sort_order',
    [listId],
  );
  const index = items.findIndex((i) => i.id === itemId);
  const targetIndex = index + delta;
  if (index === -1 || targetIndex < 0 || targetIndex >= items.length) return;
  const a = items[index];
  const b = items[targetIndex];
  await db.runAsync('UPDATE shopping_list_item SET sort_order = ? WHERE id = ?', [b.sort_order, a.id]);
  await db.runAsync('UPDATE shopping_list_item SET sort_order = ? WHERE id = ?', [a.sort_order, b.id]);
}

async function applyPantryDelta(db: DbClient, canonicalId: number, delta: number): Promise<void> {
  const existing = await db.getFirstAsync<{ quantity: number }>('SELECT quantity FROM pantry_item WHERE canonical_id = ?', [
    canonicalId,
  ]);
  if (existing) {
    const next = existing.quantity + delta;
    if (next <= 0) {
      await db.runAsync('DELETE FROM pantry_item WHERE canonical_id = ?', [canonicalId]);
    } else {
      await db.runAsync(`UPDATE pantry_item SET quantity = ?, updated_at = datetime('now') WHERE canonical_id = ?`, [
        next,
        canonicalId,
      ]);
    }
  } else if (delta > 0) {
    await db.runAsync('INSERT INTO pantry_item (canonical_id, quantity) VALUES (?, ?)', [canonicalId, delta]);
  }
  await db.runAsync(`INSERT INTO pantry_movement (canonical_id, delta, reason) VALUES (?, ?, 'shopping')`, [
    canonicalId,
    delta,
  ]);
}

// Checking an item off adds its (unit-converted) purchase quantity to the
// pantry (§5.8). An item with no canonical link (an unresolved manual entry)
// simply has nothing to add — it still checks off, it just can't inform the
// pantry pool.
export async function checkShoppingListItem(db: DbClient, itemId: number): Promise<void> {
  const item = await db.getFirstAsync<{
    canonical_id: number | null;
    quantity: number;
    unit: RecipeUnit;
    checked: number;
  }>('SELECT canonical_id, quantity, unit, checked FROM shopping_list_item WHERE id = ?', [itemId]);
  if (!item || item.checked === 1) return;

  if (item.canonical_id != null) {
    const canon = await db.getFirstAsync<{ base_unit: BaseUnit; pack_size: number | null; density: number | null }>(
      'SELECT base_unit, pack_size, density FROM canonical_ingredient WHERE id = ?',
      [item.canonical_id],
    );
    if (canon) {
      const conversion = convertToBaseUnit(
        { baseUnit: canon.base_unit, packSize: canon.pack_size, density: canon.density },
        item.quantity,
        item.unit,
      );
      if (conversion.measured && conversion.value != null) {
        await applyPantryDelta(db, item.canonical_id, conversion.value);
      }
    }
  }

  await db.runAsync(`UPDATE shopping_list_item SET checked = 1, checked_at = datetime('now') WHERE id = ?`, [itemId]);
  logger.info('pantry', 'Shopping list item checked off', { itemId, canonicalId: item.canonical_id });
}

// Unchecking reverses exactly the delta checkShoppingListItem applied.
export async function uncheckShoppingListItem(db: DbClient, itemId: number): Promise<void> {
  const item = await db.getFirstAsync<{
    canonical_id: number | null;
    quantity: number;
    unit: RecipeUnit;
    checked: number;
  }>('SELECT canonical_id, quantity, unit, checked FROM shopping_list_item WHERE id = ?', [itemId]);
  if (!item || item.checked === 0) return;

  if (item.canonical_id != null) {
    const canon = await db.getFirstAsync<{ base_unit: BaseUnit; pack_size: number | null; density: number | null }>(
      'SELECT base_unit, pack_size, density FROM canonical_ingredient WHERE id = ?',
      [item.canonical_id],
    );
    if (canon) {
      const conversion = convertToBaseUnit(
        { baseUnit: canon.base_unit, packSize: canon.pack_size, density: canon.density },
        item.quantity,
        item.unit,
      );
      if (conversion.measured && conversion.value != null) {
        await applyPantryDelta(db, item.canonical_id, -conversion.value);
      }
    }
  }

  await db.runAsync('UPDATE shopping_list_item SET checked = 0, checked_at = NULL WHERE id = ?', [itemId]);
  logger.info('pantry', 'Shopping list item unchecked', { itemId, canonicalId: item.canonical_id });
}
