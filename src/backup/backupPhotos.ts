// Native photo bundling for backups (§10). Split from exportData.ts/
// restoreData.ts — which stay pure and Vitest-runnable — because reading and
// writing image bytes needs expo-file-system. A backup carries its photos as
// base64 keyed by original URI so cook-log pictures and the profile picture
// survive a restore onto a fresh install.
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { readPhotoAsBase64, writeBase64Photo } from '../sharing/photoBase64';
import { buildBackup, collectPhotoUris, remapPhotoUris, type BackupFile } from './exportData';
import { restoreBackup } from './restoreData';

// buildBackup + read every referenced photo into the `photos` map. A photo
// that can't be read (already deleted, permission) is skipped rather than
// failing the whole export — its row keeps its original URI.
export async function buildBackupWithPhotos(db: DbClient): Promise<BackupFile> {
  const backup = await buildBackup(db);
  const uris = collectPhotoUris(backup);
  const photos: Record<string, string> = {};
  for (const uri of uris) {
    try {
      photos[uri] = await readPhotoAsBase64(uri);
    } catch (error) {
      logger.warn('db', 'Skipped unreadable photo in backup', { uri, error: String(error) });
    }
  }
  return { ...backup, photos };
}

// Writes the backup's embedded photos to fresh local files, rewrites the table
// URIs to point at them, then restores. Photos are written before the DB is
// touched so a write failure can't leave rows pointing at missing files.
export async function restoreBackupWithPhotos(db: DbClient, backup: BackupFile): Promise<void> {
  const remap: Record<string, string> = {};
  for (const [originalUri, base64] of Object.entries(backup.photos ?? {})) {
    try {
      remap[originalUri] = await writeBase64Photo(base64);
    } catch (error) {
      logger.warn('db', 'Failed to restore a photo, keeping original URI', { uri: originalUri, error: String(error) });
    }
  }
  await restoreBackup(db, remapPhotoUris(backup, remap));
}
