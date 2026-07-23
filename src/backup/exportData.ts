// §10 JSON export: "everything" — every table, dumped generically via the
// live schema (tableOrder.ts) rather than a hand-enumerated column list per
// table, so nothing is ever silently left out of a backup as the schema
// grows. Local and private, so this deliberately includes sync secrets,
// logs, and pantry state that never leave the device any other way (§7.4).
import type { DbClient } from '../db/DbClient';
import { computeTableOrder } from './tableOrder';

// Bumped to 2 when photos began travelling inside the backup (see `photos`).
// A v1 backup (photos absent) still restores fine — the tables carry the
// original URIs and the restore simply has no image bytes to rewrite.
export const BACKUP_VERSION = 2;

export interface BackupFile {
  version: number;
  exportedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
  /**
   * Embedded image bytes, keyed by the local file URI they were read from, so
   * a backup is self-contained — cook-log photos and the profile picture
   * survive a restore onto a fresh install where the original files are gone.
   */
  photos?: Record<string, string>;
}

// Every (table, column) that stores a photo file URI. Used both to collect
// bytes for export and to rewrite URIs on restore.
export const PHOTO_COLUMNS: { table: string; column: string }[] = [
  { table: 'cook_log_photo', column: 'uri' },
  { table: 'profile', column: 'avatar_uri' },
  { table: 'recipe', column: 'photo_uri' },
];

export async function buildBackup(db: DbClient): Promise<BackupFile> {
  const order = await computeTableOrder(db);
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const table of order) {
    tables[table] = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${table}`);
  }
  return { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables };
}

// Every distinct photo URI referenced by the dumped tables (pure — reads only
// the in-memory backup, not the filesystem).
export function collectPhotoUris(backup: BackupFile): string[] {
  const uris = new Set<string>();
  for (const { table, column } of PHOTO_COLUMNS) {
    for (const row of backup.tables[table] ?? []) {
      const value = row[column];
      if (typeof value === 'string' && value) uris.add(value);
    }
  }
  return [...uris];
}

// Returns a copy of the backup with photo URIs rewritten via `remap` (old →
// new local URI). Pure — the native layer writes the files and supplies the map.
export function remapPhotoUris(backup: BackupFile, remap: Record<string, string>): BackupFile {
  const tables: Record<string, Record<string, unknown>[]> = { ...backup.tables };
  for (const { table, column } of PHOTO_COLUMNS) {
    const rows = backup.tables[table];
    if (!rows) continue;
    tables[table] = rows.map((row) => {
      const value = row[column];
      return typeof value === 'string' && remap[value] ? { ...row, [column]: remap[value] } : row;
    });
  }
  return { ...backup, tables };
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup);
}
