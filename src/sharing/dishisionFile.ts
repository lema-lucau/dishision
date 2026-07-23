// .dishision file transport (§7.2) — always available, required for photos.
// Native-only (expo-file-system + expo-sharing), split out for the same
// reason as photos/compressPhoto.ts (§11.1): can't run under Vitest.
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { logger } from '../debug/logStore';
import { parseSharePayload, serializeSharePayload, type SharePayload } from './payload';
import { suggestedFileName } from './transport';

function exportDir(): Directory {
  const dir = new Directory(Paths.cache, 'shared-recipes');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

// Writes the payload to a temporary .dishision file and hands it to the OS
// share sheet. The file lives in cache — it's a transient export artifact,
// not app data that needs to survive.
export async function shareRecipeAsFile(payload: SharePayload): Promise<void> {
  const file = new File(exportDir(), suggestedFileName(payload));
  file.write(serializeSharePayload(payload));
  logger.info('db', 'Exported recipe as .dishision file', { shareId: payload.share_id, uri: file.uri });
  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Share recipe' });
}

export async function readDishisionFile(uri: string): Promise<SharePayload> {
  const text = await new File(uri).text();
  return parseSharePayload(text);
}
