// §5.8 shopping list editing + check-off. "Fully editable": edit qty/unit/
// name/buy-count, delete, reorder (within a section only), add manual, plus
// bulk check/uncheck-all. Checking an item off adds its purchase quantity
// (quantity × buy_count, unit-converted, §3.2) to the pantry and writes a
// pantry_movement row; unchecking within the same list reverses exactly
// that.
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { capitalize } from '../lib/capitalize';
import { convertToBaseUnit } from '../lib/units';
import type { BaseUnit, RecipeUnit } from '../seed/types';

// The list a manual/shortfall/recipe addition lands in outside of a full
// generation run: the most recent not-yet-completed list, or a fresh bare
// one if there isn't one yet. Shared by completeCook.ts's shortfall path and
// the recipe detail screen's "Add to shopping list" button.
export async function findOrCreateOpenShoppingList(db: DbClient): Promise<number> {
  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM shopping_list WHERE completed_at IS NULL ORDER BY created_at DESC LIMIT 1',
  );
  if (existing) return existing.id;
  const result = await db.runAsync('INSERT INTO shopping_list (name) VALUES (NULL)');
  return result.lastInsertRowId;
}

export interface AddManualItemInput {
  displayName: string;
  quantity: number;
  unit: RecipeUnit | BaseUnit;
  buyCount?: number;
  canonicalId?: number | null;
}

export async function addManualShoppingListItem(db: DbClient, listId: number, input: AddManualItemInput): Promise<number> {
  const maxSort = await db.getFirstAsync<{ max_sort: number | null }>(
    'SELECT MAX(sort_order) as max_sort FROM shopping_list_item WHERE list_id = ?',
    [listId],
  );
  const sortOrder = (maxSort?.max_sort ?? -1) + 1;
  const result = await db.runAsync(
    `INSERT INTO shopping_list_item (list_id, canonical_id, display_name, quantity, unit, manual, buy_count, sort_order)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    [listId, input.canonicalId ?? null, capitalize(input.displayName.trim()), input.quantity, input.unit, input.buyCount ?? 1, sortOrder],
  );
  logger.info('db', 'Manual shopping list item added', { listId, itemId: result.lastInsertRowId, name: input.displayName });
  return result.lastInsertRowId;
}

export interface UpdateShoppingListItemInput {
  displayName?: string;
  quantity?: number;
  unit?: RecipeUnit | BaseUnit;
  buyCount?: number;
}

export async function updateShoppingListItem(db: DbClient, itemId: number, patch: UpdateShoppingListItemInput): Promise<void> {
  const existing = await db.getFirstAsync<{ display_name: string; quantity: number; unit: string; buy_count: number }>(
    'SELECT display_name, quantity, unit, buy_count FROM shopping_list_item WHERE id = ?',
    [itemId],
  );
  if (!existing) return;
  await db.runAsync('UPDATE shopping_list_item SET display_name = ?, quantity = ?, unit = ?, buy_count = ? WHERE id = ?', [
    patch.displayName != null ? capitalize(patch.displayName.trim()) : existing.display_name,
    patch.quantity ?? existing.quantity,
    patch.unit ?? existing.unit,
    patch.buyCount ?? existing.buy_count,
    itemId,
  ]);
}

export async function deleteShoppingListItem(db: DbClient, itemId: number): Promise<void> {
  await db.runAsync('DELETE FROM shopping_list_item WHERE id = ?', [itemId]);
}

// Deletes a set of items by id in one statement. Used by the section-level
// "remove this recipe's items" long-press and the whole-list Clear button.
// Only ever touches shopping_list_item — planned_meal (the calendar) is a
// separate table and is deliberately left untouched.
export async function deleteShoppingListItems(db: DbClient, itemIds: number[]): Promise<void> {
  if (itemIds.length === 0) return;
  const placeholders = itemIds.map(() => '?').join(',');
  await db.runAsync(`DELETE FROM shopping_list_item WHERE id IN (${placeholders})`, itemIds);
}

// Empties a whole list. Same guarantee as above: the calendar plans that the
// list was generated from are not affected.
export async function clearShoppingList(db: DbClient, listId: number): Promise<void> {
  await db.runAsync('DELETE FROM shopping_list_item WHERE list_id = ?', [listId]);
}

// Drag-drop reorder, constrained to a single section: `orderedItemIds` is
// the complete set of item ids belonging to one section (a recipe, Common,
// or the manual/unsectioned bucket), in their new display order. Reassigns
// that section's own existing sort_order slots to the items in the new
// order — it never touches sort_order values outside the section, so a drag
// can't reorder an item into a different section by accident.
export async function reorderShoppingListSection(db: DbClient, orderedItemIds: number[]): Promise<void> {
  if (orderedItemIds.length === 0) return;
  const placeholders = orderedItemIds.map(() => '?').join(',');
  const rows = await db.getAllAsync<{ id: number; sort_order: number }>(
    `SELECT id, sort_order FROM shopping_list_item WHERE id IN (${placeholders}) ORDER BY sort_order`,
    orderedItemIds,
  );
  const slots = rows.map((r) => r.sort_order);
  for (let i = 0; i < orderedItemIds.length; i++) {
    await db.runAsync('UPDATE shopping_list_item SET sort_order = ? WHERE id = ?', [slots[i], orderedItemIds[i]]);
  }
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

interface ShoppingItemForToggle {
  canonical_id: number | null;
  display_name: string;
  quantity: number;
  unit: RecipeUnit;
  buy_count: number;
  checked: number;
}

async function pantryDeltaForItem(db: DbClient, item: ShoppingItemForToggle): Promise<number | null> {
  if (item.canonical_id == null) return null;
  const canon = await db.getFirstAsync<{ base_unit: BaseUnit; pack_size: number | null; density: number | null }>(
    'SELECT base_unit, pack_size, density FROM canonical_ingredient WHERE id = ?',
    [item.canonical_id],
  );
  if (!canon) return null;
  const conversion = convertToBaseUnit(
    { baseUnit: canon.base_unit, packSize: canon.pack_size, density: canon.density },
    item.quantity,
    item.unit,
  );
  if (!conversion.measured || conversion.value == null) return null;
  return conversion.value * item.buy_count;
}

// Checking an item off adds its (unit-converted) purchase quantity — the
// per-unit quantity times buy_count — to the pantry (§5.8). An item with no
// canonical link (an unresolved manual entry) simply has nothing to add —
// it still checks off, it just can't inform the pantry pool.
export async function checkShoppingListItem(db: DbClient, itemId: number): Promise<void> {
  const item = await db.getFirstAsync<ShoppingItemForToggle>(
    'SELECT canonical_id, display_name, quantity, unit, buy_count, checked FROM shopping_list_item WHERE id = ?',
    [itemId],
  );
  if (!item || item.checked === 1) return;

  const delta = await pantryDeltaForItem(db, item);
  if (delta != null) await applyPantryDelta(db, item.canonical_id!, delta);

  await db.runAsync(`UPDATE shopping_list_item SET checked = 1, checked_at = datetime('now') WHERE id = ?`, [itemId]);
  logger.info('pantry', 'Shopping list item checked off', { itemId, canonicalId: item.canonical_id, name: item.display_name });
}

// Unchecking reverses exactly the delta checkShoppingListItem applied.
export async function uncheckShoppingListItem(db: DbClient, itemId: number): Promise<void> {
  const item = await db.getFirstAsync<ShoppingItemForToggle>(
    'SELECT canonical_id, display_name, quantity, unit, buy_count, checked FROM shopping_list_item WHERE id = ?',
    [itemId],
  );
  if (!item || item.checked === 0) return;

  const delta = await pantryDeltaForItem(db, item);
  if (delta != null) await applyPantryDelta(db, item.canonical_id!, -delta);

  await db.runAsync('UPDATE shopping_list_item SET checked = 0, checked_at = NULL WHERE id = ?', [itemId]);
  logger.info('pantry', 'Shopping list item unchecked', { itemId, canonicalId: item.canonical_id, name: item.display_name });
}

// Mark-all-checked / mark-all-unchecked bulk actions, applied item by item
// so each still goes through the same pantry-delta logic (and thus the same
// pantry_movement trail) as an individual check-off.
export async function checkAllShoppingListItems(db: DbClient, listId: number): Promise<void> {
  const ids = await db.getAllAsync<{ id: number }>('SELECT id FROM shopping_list_item WHERE list_id = ? AND checked = 0', [listId]);
  for (const { id } of ids) await checkShoppingListItem(db, id);
}

export async function uncheckAllShoppingListItems(db: DbClient, listId: number): Promise<void> {
  const ids = await db.getAllAsync<{ id: number }>('SELECT id FROM shopping_list_item WHERE list_id = ? AND checked = 1', [listId]);
  for (const { id } of ids) await uncheckShoppingListItem(db, id);
}
