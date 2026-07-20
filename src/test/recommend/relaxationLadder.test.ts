import { describe, expect, it } from 'vitest';
import { relaxationLadder } from '../../recommend/relaxationLadder';

describe('relaxationLadder (§6.3)', () => {
  it('steps 5 → 3 → 2 → off at the default window', () => {
    expect(relaxationLadder(5)).toEqual([5, 3, 2, 0]);
  });

  it('steps 14 → 7 → 4 → off at a user-set 14-day window', () => {
    expect(relaxationLadder(14)).toEqual([14, 7, 4, 0]);
  });

  it('is just "off" when the window is already disabled', () => {
    expect(relaxationLadder(0)).toEqual([0]);
  });

  it('never produces a negative or NaN rung for a tiny window', () => {
    expect(relaxationLadder(1)).toEqual([1, 1, 1, 0]);
  });
});
