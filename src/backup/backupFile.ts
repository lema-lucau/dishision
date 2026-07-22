// §10 manual export/restore — native file IO + OS pickers, split out from
// exportData.ts/restoreData.ts for the same reason as photos/compressPhoto.ts
// (§11.1): can't run under Vitest's node environment.
import { Directory, File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { serializeBackup, type BackupFile as BackupFileShape } from './exportData';
import { buildBackupWithPhotos } from './backupPhotos';
import { parseBackup } from './restoreData';

function exportDir(): Directory {
  const dir = new Directory(Paths.cache, 'backup-export');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export async function exportBackupToFile(db: DbClient): Promise<void> {
  const backup = await buildBackupWithPhotos(db);
  // dishision_backup_<DATE>_<TIME>.json, e.g. dishision_backup_2026-07-22_14-30-05.json
  const iso = new Date().toISOString();
  const date = iso.slice(0, 10);
  const time = iso.slice(11, 19).replace(/:/g, '-');
  const file = new File(exportDir(), `dishision_backup_${date}_${time}.json`);
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
