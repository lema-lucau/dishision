// §5.8 pantry — "the pool". Auto-populated from shopping check-offs (§5.8),
// drained by cooking (§5.7/pantryConsumption.ts), and fully editable by hand
// here, because the pool has no other way to learn you binned the wilted
// spinach. No expiry (§1.2) — items persist until consumed or removed.
// pantry_item.quantity is always stored in base units (§3.1); the display
// unit preference (unitPreference.ts) is purely a rendering choice layered
// on top.
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { canonicalIngredientName } from '../debug/logNames';
import { convertDisplayUnitToBase, type DisplayUnit } from '../lib/displayUnit';
import { loadUnitPreferences } from './unitPreference';
import type { BaseUnit } from '../seed/types';

export interface PantryItemRow {
  canonicalId: number;
  name: string;
  quantity: number;
  baseUnit: BaseUnit;
  packSize: number | null;
  packLabel: string | null;
  density: number | null;
  category: string | null;
  isStaple: boolean;
  preferredUnit: DisplayUnit | null;
  updatedAt: string;
}

export async function loadPantry(db: DbClient): Promise<PantryItemRow[]> {
  const rows = await db.getAllAsync<{
    canonical_id: number;
    name: string;
    quantity: number;
    base_unit: BaseUnit;
    pack_size: number | null;
    pack_label: string | null;
    density: number | null;
    category: string | null;
    updated_at: string;
  }>(
    `SELECT pi.canonical_id, ci.name, pi.quantity, ci.base_unit, ci.pack_size, ci.pack_label, ci.density, ci.category, pi.updated_at
     FROM pantry_item pi
     JOIN canonical_ingredient ci ON ci.id = pi.canonical_id
     ORDER BY ci.name`,
  );
  const stapleRows = await db.getAllAsync<{ canonical_id: number }>('SELECT canonical_id FROM staple');
  const stapleIds = new Set(stapleRows.map((r) => r.canonical_id));
  const preferences = await loadUnitPreferences(db);
  return rows.map((r) => ({
    canonicalId: r.canonical_id,
    name: r.name,
    quantity: r.quantity,
    baseUnit: r.base_unit,
    packSize: r.pack_size,
    packLabel: r.pack_label,
    density: r.density,
    category: r.category,
    isStaple: stapleIds.has(r.canonical_id),
    preferredUnit: preferences.get(r.canonical_id) ?? null,
    updatedAt: r.updated_at,
  }));
}

// Manual edit — sets the pantry row to an exact quantity (in base units) and
// logs the delta as a 'manual' pantry_movement, whether that's correcting a
// miscount or recording that half the bag went in the bin.
export async function setPantryQuantity(db: DbClient, canonicalId: number, quantity: number): Promise<void> {
  const existing = await db.getFirstAsync<{ quantity: number }>('SELECT quantity FROM pantry_item WHERE canonical_id = ?', [
    canonicalId,
  ]);
  const delta = quantity - (existing?.quantity ?? 0);

  if (quantity <= 0) {
    await db.runAsync('DELETE FROM pantry_item WHERE canonical_id = ?', [canonicalId]);
  } else if (existing) {
    await db.runAsync(`UPDATE pantry_item SET quantity = ?, updated_at = datetime('now') WHERE canonical_id = ?`, [
      quantity,
      canonicalId,
    ]);
  } else {
    await db.runAsync('INSERT INTO pantry_item (canonical_id, quantity) VALUES (?, ?)', [canonicalId, quantity]);
  }

  if (delta !== 0) {
    await db.runAsync(`INSERT INTO pantry_movement (canonical_id, delta, reason) VALUES (?, ?, 'manual')`, [
      canonicalId,
      delta,
    ]);
  }
  logger.info('pantry', 'Pantry quantity set manually', { canonicalId, name: await canonicalIngredientName(db, canonicalId), quantity, delta });
}

// Same as setPantryQuantity, but takes a value typed in an arbitrary
// display unit (whatever the row's current preference is) and converts it
// to base units before writing — the UI never writes a non-base-unit value.
export async function setPantryQuantityInUnit(
  db: DbClient,
  ingredient: { canonicalId: number; baseUnit: BaseUnit; packSize: number | null; density: number | null },
  value: number,
  unit: DisplayUnit,
): Promise<boolean> {
  const baseQuantity = convertDisplayUnitToBase(ingredient, value, unit);
  if (baseQuantity == null) return false;
  await setPantryQuantity(db, ingredient.canonicalId, baseQuantity);
  return true;
}

export async function removePantryItem(db: DbClient, canonicalId: number): Promise<void> {
  await setPantryQuantity(db, canonicalId, 0);
}

export async function removePantryItems(db: DbClient, canonicalIds: number[]): Promise<void> {
  for (const id of canonicalIds) await removePantryItem(db, id);
}

// §C2 "Clear pantry" — empties every pantry_item row, including the stock held
// against staples (the staple flags themselves survive; only the on-hand
// quantity is cleared). Each removal still logs its 'manual' movement.
export async function clearPantry(db: DbClient): Promise<void> {
  const rows = await db.getAllAsync<{ canonical_id: number }>('SELECT canonical_id FROM pantry_item');
  for (const r of rows) await removePantryItem(db, r.canonical_id);
  logger.info('pantry', 'Pantry cleared', { count: rows.length });
}
