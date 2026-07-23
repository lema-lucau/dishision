// Native-only file IO for the §7.1 payload's opt-in photo field. Split out
// from payload.ts (same reasoning as photos/compressPhoto.ts, §11.1) so the
// pure payload build/parse logic stays runnable under Vitest's node
// environment without touching expo-file-system.
import { File } from 'expo-file-system';
import { Directory, Paths } from 'expo-file-system';
import { uuidv4 } from '../utils/uuid';

export async function readPhotoAsBase64(uri: string): Promise<string> {
  return new File(uri).base64();
}

// Writes an imported payload's base64 photo into permanent app storage and
// returns the new local URI, mirroring photos/compressPhoto.ts's storage
// convention (Paths.document/photos, not cache).
export async function writeBase64Photo(base64: string): Promise<string> {
  const dir = new Directory(Paths.document, 'photos');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, `${uuidv4()}.jpg`);
  file.write(base64, { encoding: 'base64' });
  return file.uri;
}
