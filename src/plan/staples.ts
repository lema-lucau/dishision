// §5.8 staples — the always-have list. Excluded from generated shopping
// lists (shoppingListGeneration.ts) unless flagged running_low.
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import type { BaseUnit } from '../seed/types';

export interface StapleRow {
  canonicalId: number;
  name: string;
  baseUnit: BaseUnit;
  runningLow: boolean;
}

export async function loadStaples(db: DbClient): Promise<StapleRow[]> {
  const rows = await db.getAllAsync<{ canonical_id: number; name: string; base_unit: BaseUnit; running_low: number }>(
    `SELECT s.canonical_id, ci.name, ci.base_unit, s.running_low
     FROM staple s
     JOIN canonical_ingredient ci ON ci.id = s.canonical_id
     ORDER BY ci.name`,
  );
  return rows.map((r) => ({ canonicalId: r.canonical_id, name: r.name, baseUnit: r.base_unit, runningLow: r.running_low === 1 }));
}

export async function addStaple(db: DbClient, canonicalId: number): Promise<void> {
  await db.runAsync('INSERT OR IGNORE INTO staple (canonical_id) VALUES (?)', [canonicalId]);
  logger.info('db', 'Staple added', { canonicalId });
}

export async function removeStaple(db: DbClient, canonicalId: number): Promise<void> {
  await db.runAsync('DELETE FROM staple WHERE canonical_id = ?', [canonicalId]);
  logger.info('db', 'Staple removed', { canonicalId });
}

export async function setStapleRunningLow(db: DbClient, canonicalId: number, runningLow: boolean): Promise<void> {
  await db.runAsync('UPDATE staple SET running_low = ? WHERE canonical_id = ?', [runningLow ? 1 : 0, canonicalId]);
}
