import { describe, expect, it } from 'vitest';
import { computeResizeTarget, MAX_LONG_EDGE } from '../../photos/resizeMath';

describe('computeResizeTarget (§8)', () => {
  it('pins width for a landscape source', () => {
    expect(computeResizeTarget(2000, 1000)).toEqual({ width: MAX_LONG_EDGE });
  });

  it('pins height for a portrait source', () => {
    expect(computeResizeTarget(1000, 2000)).toEqual({ height: MAX_LONG_EDGE });
  });

  it('pins width for an oversized square source', () => {
    expect(computeResizeTarget(1600, 1600)).toEqual({ width: MAX_LONG_EDGE });
  });

  it('is a no-op exactly at the threshold', () => {
    expect(computeResizeTarget(MAX_LONG_EDGE, 900)).toEqual({});
  });

  it('does not upscale a source already under the threshold — "max 1280px" is a ceiling, not a forced target', () => {
    // The spec's "unconditional" claim is about the pipeline step (§8:
    // compressPhoto.ts must still re-encode at quality 0.7 rather than
    // skip processing because dimensions look fine already) — it is not a
    // license to blow a 400x300 photo up to 1280x960.
    expect(computeResizeTarget(400, 300)).toEqual({});
    expect(computeResizeTarget(300, 400)).toEqual({});
  });

  it('returns no resize target for degenerate/unknown dimensions rather than guessing a size', () => {
    expect(computeResizeTarget(0, 0)).toEqual({});
  });

  it('respects a custom max long edge', () => {
    expect(computeResizeTarget(2000, 1000, 640)).toEqual({ width: 640 });
  });
});
