// §5.8 pantry — "the pool". Auto-populated from shopping check-offs (§5.8),
// drained by cooking (§5.7/pantryConsumption.ts), and fully editable by hand
// here, because the pool has no other way to learn you binned the wilted
// spinach. No expiry (§1.2) — items persist until consumed or removed.
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import type { BaseUnit } from '../seed/types';

export interface PantryItemRow {
  canonicalId: number;
  name: string;
  quantity: number;
  baseUnit: BaseUnit;
  packLabel: string | null;
  isStaple: boolean;
  updatedAt: string;
}

export async function loadPantry(db: DbClient): Promise<PantryItemRow[]> {
  const rows = await db.getAllAsync<{
    canonical_id: number;
    name: string;
    quantity: number;
    base_unit: BaseUnit;
    pack_label: string | null;
    updated_at: string;
  }>(
    `SELECT pi.canonical_id, ci.name, pi.quantity, ci.base_unit, ci.pack_label, pi.updated_at
     FROM pantry_item pi
     JOIN canonical_ingredient ci ON ci.id = pi.canonical_id
     ORDER BY ci.name`,
  );
  const stapleRows = await db.getAllAsync<{ canonical_id: number }>('SELECT canonical_id FROM staple');
  const stapleIds = new Set(stapleRows.map((r) => r.canonical_id));
  return rows.map((r) => ({
    canonicalId: r.canonical_id,
    name: r.name,
    quantity: r.quantity,
    baseUnit: r.base_unit,
    packLabel: r.pack_label,
    isStaple: stapleIds.has(r.canonical_id),
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
  logger.info('pantry', 'Pantry quantity set manually', { canonicalId, quantity, delta });
}

export async function removePantryItem(db: DbClient, canonicalId: number): Promise<void> {
  await setPantryQuantity(db, canonicalId, 0);
}
