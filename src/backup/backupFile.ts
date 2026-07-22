// §10 manual export/restore — native file IO + OS pickers, split out from
// exportData.ts/restoreData.ts for the same reason as photos/compressPhoto.ts
// (§11.1): can't run under Vitest's node environment.
import { Directory, File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { buildBackup, serializeBackup, type BackupFile as BackupFileShape } from './exportData';
import { parseBackup } from './restoreData';

function exportDir(): Directory {
  const dir = new Directory(Paths.cache, 'backup-export');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export async function exportBackupToFile(db: DbClient): Promise<void> {
  const backup = await buildBackup(db);
  const file = new File(exportDir(), `dishision-backup-${new Date().toISOString().slice(0, 10)}.json`);
  file.write(serializeBackup(backup));
  logger.info('db', 'Manual backup exported', { uri: file.uri });
  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Export Dishision backup' });
}

export async function readBackupFile(uri: string): Promise<BackupFileShape> {
  const text = await new File(uri).text();
  return parseBackup(text);
}

// Returns null when the user cancels the picker.
export async function pickBackupFile(): Promise<BackupFileShape | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
  if (result.canceled || result.assets.length === 0) return null;
  return readBackupFile(result.assets[0].uri);
}
