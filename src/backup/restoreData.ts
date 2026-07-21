// §10 restore: "validates the version and refuses forward-incompatible
// files rather than half-importing." A full wipe-and-replace inside one
// transaction — the app ends up byte-identical to the backup, not a union
// of both, and a failure partway through leaves the previous state intact.
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { BACKUP_VERSION, type BackupFile } from './exportData';
import { computeTableOrder } from './tableOrder';

export class BackupValidationError extends Error {}

export function parseBackup(json: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new BackupValidationError('Not valid JSON');
  }
  if (typeof data !== 'object' || data === null) {
    throw new BackupValidationError('Malformed backup file');
  }
  const candidate = data as Partial<BackupFile>;
  if (typeof candidate.version !== 'number') {
    throw new BackupValidationError('Missing version');
  }
  if (candidate.version > BACKUP_VERSION) {
    throw new BackupValidationError(
      `This backup is from a newer version of Preppie (v${candidate.version}) and can't be restored here.`,
    );
  }
  if (!candidate.tables || typeof candidate.tables !== 'object') {
    throw new BackupValidationError('Missing table data');
  }
  return { version: candidate.version, exportedAt: candidate.exportedAt ?? '', tables: candidate.tables };
}

async function insertRow(db: DbClient, table: string, row: Record<string, unknown>): Promise<void> {
  const columns = Object.keys(row);
  if (columns.length === 0) return;
  const placeholders = columns.map(() => '?').join(', ');
  await db.runAsync(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`, columns.map((c) => row[c]));
}

export async function restoreBackup(db: DbClient, backup: BackupFile): Promise<void> {
  const order = await computeTableOrder(db);
  await db.execAsync('BEGIN');
  try {
    for (const table of [...order].reverse()) {
      await db.runAsync(`DELETE FROM ${table}`);
    }
    for (const table of order) {
      for (const row of backup.tables[table] ?? []) {
        await insertRow(db, table, row);
      }
    }
    await db.execAsync('COMMIT');
    logger.info('db', 'Restored from backup', { version: backup.version, exportedAt: backup.exportedAt, tableCount: order.length });
  } catch (error) {
    await db.execAsync('ROLLBACK');
    logger.error('db', 'Backup restore failed, rolled back', { error: String(error) });
    throw error;
  }
}
