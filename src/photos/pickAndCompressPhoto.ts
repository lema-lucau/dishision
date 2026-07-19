// Library-picker entry point into the §8 pipeline. Kept UI-free — callers
// (CookLogEditor today, recipe hero/avatar later) decide how to react to a
// null result (user cancelled or denied permission).
import * as ImagePicker from 'expo-image-picker';
import { logger } from '../debug/logStore';
import { compressPhoto, type CompressedPhoto } from './compressPhoto';

export async function pickAndCompressPhoto(): Promise<CompressedPhoto | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    logger.warn('photo', 'Media library permission denied');
    return null;
  }

  // quality: 1 — the picker's own compression is left off; §8's compressPhoto
  // is the single place quality (0.7) is decided, not the picker.
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
  });
  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  return compressPhoto({ uri: asset.uri, width: asset.width, height: asset.height });
}
