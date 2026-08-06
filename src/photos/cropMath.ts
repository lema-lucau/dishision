// Pure crop-rect math for the recipe-photo editor, kept native-module-free so
// it runs under Vitest (the modal that uses it can't — it needs reanimated and
// the manipulator). Turns an on-screen cover-fit frame position into a crop
// rectangle in SOURCE pixels for expo-image-manipulator's crop().
import type { CropRect } from './compressPhoto';

export interface Size {
  width: number;
  height: number;
}

// The cover-fit scale for `natural` in `frame`, plus the resulting overflow on
// each axis (the draggable range: the image is larger than the frame on at
// least one axis after cover scaling).
export function coverFit(natural: Size, frame: Size): { scale: number; overflowX: number; overflowY: number } {
  const scale = Math.max(frame.width / natural.width, frame.height / natural.height);
  return {
    scale,
    overflowX: Math.max(0, natural.width * scale - frame.width),
    overflowY: Math.max(0, natural.height * scale - frame.height),
  };
}

// `translateX/Y` are the image's on-screen offset (in frame px, ≤ 0), as the
// pan gesture leaves them. `offset = -translate / overflow` is the 0..1
// position of the frame within the image; that maps to where the crop starts in
// source pixels. The result is clamped so rounding can never request a
// rectangle that runs past the source edges.
export function frameToSourceCrop(
  natural: Size,
  frame: Size,
  translateX: number,
  translateY: number,
): CropRect {
  const { scale, overflowX, overflowY } = coverFit(natural, frame);
  const offsetX = overflowX > 0 ? -translateX / overflowX : 0;
  const offsetY = overflowY > 0 ? -translateY / overflowY : 0;

  const visibleWidth = Math.min(Math.round(frame.width / scale), natural.width);
  const visibleHeight = Math.min(Math.round(frame.height / scale), natural.height);

  const originX = Math.round(clamp01(offsetX) * (natural.width - visibleWidth));
  const originY = Math.round(clamp01(offsetY) * (natural.height - visibleHeight));

  return { originX, originY, width: visibleWidth, height: visibleHeight };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
