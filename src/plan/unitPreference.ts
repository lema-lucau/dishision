// Per-ingredient Pantry *display* unit preference (migration 003). Row
// absent = show in the ingredient's base_unit (the default); deleting the
// row is exactly what "reset to default" does. Never touches
// pantry_item.quantity, which always stays in base units (§3.1).
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import type { DisplayUnit } from '../lib/displayUnit';

export async function getUnitPreference(db: DbClient, canonicalId: number): Promise<DisplayUnit | null> {
  const row = await db.getFirstAsync<{ unit: string }>(
    'SELECT unit FROM ingredient_unit_preference WHERE canonical_id = ?',
    [canonicalId],
  );
  return (row?.unit as DisplayUnit) ?? null;
}

export async function loadUnitPreferences(db: DbClient): Promise<Map<number, DisplayUnit>> {
  const rows = await db.getAllAsync<{ canonical_id: number; unit: string }>('SELECT canonical_id, unit FROM ingredient_unit_preference');
  return new Map(rows.map((r) => [r.canonical_id, r.unit as DisplayUnit]));
}

export async function setUnitPreference(db: DbClient, canonicalId: number, unit: DisplayUnit): Promise<void> {
  await db.runAsync(
    `INSERT INTO ingredient_unit_preference (canonical_id, unit) VALUES (?, ?)
     ON CONFLICT(canonical_id) DO UPDATE SET unit = excluded.unit`,
    [canonicalId, unit],
  );
  logger.info('db', 'Pantry display-unit preference set', { canonicalId, unit });
}

export async function resetUnitPreference(db: DbClient, canonicalId: number): Promise<void> {
  await db.runAsync('DELETE FROM ingredient_unit_preference WHERE canonical_id = ?', [canonicalId]);
  logger.info('db', 'Pantry display-unit preference reset to default', { canonicalId });
}
