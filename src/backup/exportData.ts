// §10 JSON export: "everything" — every table, dumped generically via the
// live schema (tableOrder.ts) rather than a hand-enumerated column list per
// table, so nothing is ever silently left out of a backup as the schema
// grows. Local and private, so this deliberately includes sync secrets,
// logs, and pantry state that never leave the device any other way (§7.4).
import type { DbClient } from '../db/DbClient';
import { computeTableOrder } from './tableOrder';

export const BACKUP_VERSION = 1;

export interface BackupFile {
  version: number;
  exportedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
}

export async function buildBackup(db: DbClient): Promise<BackupFile> {
  const order = await computeTableOrder(db);
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const table of order) {
    tables[table] = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${table}`);
  }
  return { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables };
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup);
}
