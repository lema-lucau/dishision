// §8 photo pipeline — the one path every photo in the app goes through
// (recipe hero, cook log photos, profile avatar) before it touches disk:
// resize to max 1280px on the long edge (unconditional), JPEG quality 0.7,
// write to app storage, return the URI. Not cook-log-specific by design —
// later slices (recipe hero, avatar) call the same compressPhoto().
//
// Native-module code (ImageManipulator, expo-file-system) can't run under
// Vitest's node environment (§11.1), so the pure resize math lives in
// resizeMath.ts and is unit tested there; this file is exercised on-device
// only. See the S10 report for what that leaves uncovered.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';
import { logger } from '../debug/logStore';
import { uuidv4 } from '../utils/uuid';
import { computeResizeTarget, JPEG_QUALITY } from './resizeMath';

// A crop rectangle in SOURCE pixels, applied before the resize/compress pass —
// this is how the recipe-photo crop editor bakes the region the user chose so
// the stored file already frames the dish (no display-time focal-point math).
export interface CropRect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

export interface CompressPhotoInput {
  /** Source URI as returned by the picker/camera — file:// or content://. */
  uri: string;
  width: number;
  height: number;
  /** Optional pre-crop in source pixels; the resize cap then applies to the cropped size. */
  crop?: CropRect;
}

export interface CompressedPhoto {
  uri: string;
  width: number;
  height: number;
}

function photosDir(): Directory {
  const dir = new Directory(Paths.document, 'photos');
  // idempotent: true — this runs on every photo save, not just the first,
  // and the directory legitimately already exists after the first call.
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function safeFileSize(uri: string): number {
  try {
    return new File(uri).size;
  } catch {
    return 0;
  }
}

// Resizes+compresses `input` per §8 and copies the result into permanent app
// storage (Paths.document, not cache — a cook log photo must survive the OS
// clearing the cache). Logs source/output dims+bytes unconditionally (§12.4).
export async function compressPhoto(input: CompressPhotoInput): Promise<CompressedPhoto> {
  const { uri, width: sourceWidth, height: sourceHeight, crop } = input;
  const sourceBytes = safeFileSize(uri);

  // After an optional crop the "source" dimensions the resize cap reasons about
  // are the cropped ones — a crop out of a 4000px photo shouldn't still be
  // treated as 4000px wide.
  const effectiveWidth = crop ? crop.width : sourceWidth;
  const effectiveHeight = crop ? crop.height : sourceHeight;

  // The resize call itself is only issued when the source actually exceeds
  // the cap (§8 — "max 1280px" is a ceiling, not a forced upscale target).
  // What's unconditional is everything below: renderAsync/saveAsync always
  // run, so a photo that's already small still gets re-encoded at quality
  // 0.7 rather than passed through untouched at its original bytes.
  const target = computeResizeTarget(effectiveWidth, effectiveHeight);
  let pipeline = ImageManipulator.manipulate(uri);
  // Crop first, then resize — the crop is expressed in source pixels.
  if (crop) pipeline = pipeline.crop(crop);
  if (target.width != null || target.height != null) pipeline = pipeline.resize(target);
  const rendered = await pipeline.renderAsync();
  const saved = await rendered.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });

  const dest = new File(photosDir(), `${uuidv4()}.jpg`);
  new File(saved.uri).copy(dest);
  const outputBytes = dest.size;

  logger.info('photo', 'Compressed photo', {
    sourceWidth,
    sourceHeight,
    sourceBytes,
    outputWidth: saved.width,
    outputHeight: saved.height,
    outputBytes,
  });

  return { uri: dest.uri, width: saved.width, height: saved.height };
}
