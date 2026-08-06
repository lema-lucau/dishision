import { describe, expect, it } from 'vitest';
import { coverFit, frameToSourceCrop } from '../../photos/cropMath';

const FRAME = { width: 300, height: 225 }; // 4:3

describe('coverFit', () => {
  it('scales a wide source to cover the frame, overflowing horizontally', () => {
    // 800×450 (16:9) into 300×225 (4:3): height is the binding edge.
    const fit = coverFit({ width: 800, height: 450 }, FRAME);
    expect(fit.scale).toBeCloseTo(225 / 450, 5);
    expect(fit.overflowX).toBeGreaterThan(0);
    expect(fit.overflowY).toBe(0);
  });

  it('overflows vertically for a tall source', () => {
    const fit = coverFit({ width: 450, height: 800 }, FRAME);
    expect(fit.overflowY).toBeGreaterThan(0);
    expect(fit.overflowX).toBe(0);
  });
});

describe('frameToSourceCrop', () => {
  it('crops the centre when the image is centred', () => {
    // 800×450 cover-fit into 4:3: scale 0.5, visible source = 600×450.
    // Centred translate = -overflowX/2.
    const natural = { width: 800, height: 450 };
    const { overflowX } = coverFit(natural, FRAME);
    const crop = frameToSourceCrop(natural, FRAME, -overflowX / 2, 0);
    expect(crop.width).toBe(600);
    expect(crop.height).toBe(450);
    expect(crop.originX).toBe(100); // (800 - 600) / 2
    expect(crop.originY).toBe(0);
  });

  it('crops the left edge when dragged fully right (translate 0)', () => {
    const natural = { width: 800, height: 450 };
    const crop = frameToSourceCrop(natural, FRAME, 0, 0);
    expect(crop.originX).toBe(0);
  });

  it('crops the right edge when dragged fully left', () => {
    const natural = { width: 800, height: 450 };
    const { overflowX } = coverFit(natural, FRAME);
    const crop = frameToSourceCrop(natural, FRAME, -overflowX, 0);
    expect(crop.originX).toBe(natural.width - crop.width); // 200
  });

  it('never produces a rect exceeding the source bounds', () => {
    const natural = { width: 640, height: 480 };
    const crop = frameToSourceCrop(natural, FRAME, 0, 0);
    expect(crop.originX + crop.width).toBeLessThanOrEqual(natural.width);
    expect(crop.originY + crop.height).toBeLessThanOrEqual(natural.height);
  });
});
