// §5.8 staples — the always-have list. Excluded from generated shopping
// lists (shoppingListGeneration.ts) unless flagged running_low.
//
// Running low is either calculated or manual, depending on whether a par
// level is set: with a par_level, runningLow = pantry quantity < par_level,
// recalculated live off the pantry row every time it's read; with no par
// level, it falls back to the plain manual toggle exactly as before, so a
// staple nobody has set a par level for yet behaves unchanged.
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { canonicalIngredientName } from '../debug/logNames';
import type { BaseUnit } from '../seed/types';

export interface StapleRow {
  canonicalId: number;
  name: string;
  baseUnit: BaseUnit;
  category: string | null;
  quantity: number;
  parLevel: number | null;
  manualRunningLow: boolean;
  runningLow: boolean;
}

export async function loadStaples(db: DbClient): Promise<StapleRow[]> {
  const rows = await db.getAllAsync<{
    canonical_id: number;
    name: string;
    base_unit: BaseUnit;
    category: string | null;
    quantity: number | null;
    running_low: number;
    par_level: number | null;
  }>(
    `SELECT s.canonical_id, ci.name, ci.base_unit, ci.category, pi.quantity, s.running_low, s.par_level
     FROM staple s
     JOIN canonical_ingredient ci ON ci.id = s.canonical_id
     LEFT JOIN pantry_item pi ON pi.canonical_id = s.canonical_id
     ORDER BY ci.name`,
  );
  return rows.map((r) => {
    const quantity = r.quantity ?? 0;
    const manualRunningLow = r.running_low === 1;
    return {
      canonicalId: r.canonical_id,
      name: r.name,
      baseUnit: r.base_unit,
      category: r.category,
      quantity,
      parLevel: r.par_level,
      manualRunningLow,
      runningLow: r.par_level != null ? quantity < r.par_level : manualRunningLow,
    };
  });
}

export async function setStapleParLevel(db: DbClient, canonicalId: number, parLevel: number | null): Promise<void> {
  await db.runAsync('UPDATE staple SET par_level = ? WHERE canonical_id = ?', [parLevel, canonicalId]);
  logger.info('db', 'Staple par level set', { canonicalId, name: await canonicalIngredientName(db, canonicalId), parLevel });
}

export async function addStaple(db: DbClient, canonicalId: number): Promise<void> {
  await db.runAsync('INSERT OR IGNORE INTO staple (canonical_id) VALUES (?)', [canonicalId]);
  logger.info('db', 'Staple added', { canonicalId, name: await canonicalIngredientName(db, canonicalId) });
}

export async function removeStaple(db: DbClient, canonicalId: number): Promise<void> {
  await db.runAsync('DELETE FROM staple WHERE canonical_id = ?', [canonicalId]);
  logger.info('db', 'Staple removed', { canonicalId, name: await canonicalIngredientName(db, canonicalId) });
}

export async function removeStaples(db: DbClient, canonicalIds: number[]): Promise<void> {
  for (const id of canonicalIds) await removeStaple(db, id);
}

export async function setStapleRunningLow(db: DbClient, canonicalId: number, runningLow: boolean): Promise<void> {
  await db.runAsync('UPDATE staple SET running_low = ? WHERE canonical_id = ?', [runningLow ? 1 : 0, canonicalId]);
}
