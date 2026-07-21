// §10 automatic local backup: "written on app background, last 5 retained,
// restorable in-app." Native-only file IO, same reasoning as backupFile.ts.
import { Directory, File, Paths } from 'expo-file-system';
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { buildBackup, serializeBackup } from './exportData';

const MAX_AUTO_BACKUPS = 5;
const FILE_PATTERN = /^backup-(\d+)\.json$/;

function backupsDir(): Directory {
  const dir = new Directory(Paths.document, 'backups');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export interface AutoBackupEntry {
  uri: string;
  createdAt: Date;
}

export function listAutoBackups(): AutoBackupEntry[] {
  return backupsDir()
    .list()
    .filter((entry): entry is File => entry instanceof File && FILE_PATTERN.test(entry.name))
    .map((file) => {
      const match = file.name.match(FILE_PATTERN)!;
      return { uri: file.uri, createdAt: new Date(Number(match[1])) };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function writeAutoBackup(db: DbClient): Promise<void> {
  const backup = await buildBackup(db);
  const file = new File(backupsDir(), `backup-${Date.now()}.json`);
  file.write(serializeBackup(backup));
  logger.info('db', 'Auto-backup written', { uri: file.uri });

  const existing = listAutoBackups();
  for (const stale of existing.slice(MAX_AUTO_BACKUPS)) {
    try {
      new File(stale.uri).delete();
    } catch (error) {
      logger.warn('db', 'Failed to prune old auto-backup', { uri: stale.uri, error: String(error) });
    }
  }
}
