// Library-picker entry point into the §8 pipeline. Kept UI-free — callers
// (CookLogEditor today, recipe hero/avatar later) decide how to react to a
// null result (user cancelled or denied permission).
import * as ImagePicker from 'expo-image-picker';
import { logger } from '../debug/logStore';
import { compressPhoto, type CompressedPhoto } from './compressPhoto';

export async function pickAndCompressPhoto(): Promise<CompressedPhoto | null> {
  const photos = await pickAndCompressPhotos({ allowsMultipleSelection: false });
  return photos[0] ?? null;
}

// §5.9: cook log photos support picking several at once rather than
// round-tripping the picker per photo. Each selected asset still goes
// through the same §8 pipeline individually.
export async function pickAndCompressPhotos({ allowsMultipleSelection = true }: { allowsMultipleSelection?: boolean } = {}): Promise<
  CompressedPhoto[]
> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    logger.warn('photo', 'Media library permission denied');
    return [];
  }

  // quality: 1 — the picker's own compression is left off; §8's compressPhoto
  // is the single place quality (0.7) is decided, not the picker.
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsMultipleSelection,
  });
  if (result.canceled || result.assets.length === 0) return [];

  const compressed: CompressedPhoto[] = [];
  for (const asset of result.assets) {
    compressed.push(await compressPhoto({ uri: asset.uri, width: asset.width, height: asset.height }));
  }
  return compressed;
}
