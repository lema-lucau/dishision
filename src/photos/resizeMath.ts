// Pure sizing math for the §8 photo pipeline, kept free of any native-module
// import so it can run under Vitest's node environment (unlike compressPhoto.ts,
// which calls expo-image-manipulator/expo-file-system and can't).
export const MAX_LONG_EDGE = 1280;
export const JPEG_QUALITY = 0.7;

export interface ResizeTarget {
  width?: number;
  height?: number;
}

// §8: "max 1280px on the long edge" is a ceiling, not a fixed target — a
// 400×300 source stays 400×300, it does not get upscaled to 1280×960. What's
// unconditional is the *pipeline step itself* (compressPhoto.ts always runs
// the recompress-to-JPEG-0.7 pass, never skips it just because dimensions
// already look fine — that "already small enough" shortcut is the exact bug
// the spec calls out, since it only ever checked dimensions, never bytes).
// So: pin whichever axis is the long edge to maxLongEdge only when the
// source actually exceeds it; otherwise return no dimension change at all
// and let the caller still recompress at the original size.
export function computeResizeTarget(sourceWidth: number, sourceHeight: number, maxLongEdge = MAX_LONG_EDGE): ResizeTarget {
  if (sourceWidth <= 0 || sourceHeight <= 0) return {};
  if (Math.max(sourceWidth, sourceHeight) <= maxLongEdge) return {};
  return sourceWidth >= sourceHeight ? { width: maxLongEdge } : { height: maxLongEdge };
}
