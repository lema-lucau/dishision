import { describe, expect, it } from 'vitest';
import { paginate } from '../../lib/paginate';

const list = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('paginate', () => {
  it('slices the requested page', () => {
    const { pageItems, totalPages, clampedPage } = paginate(list(10), 2, 3);
    expect(pageItems).toEqual([4, 5, 6]);
    expect(totalPages).toBe(4); // ceil(10/3)
    expect(clampedPage).toBe(2);
  });

  it('clamps a page past the end down to the last page', () => {
    const { pageItems, clampedPage, totalPages } = paginate(list(10), 99, 4);
    expect(totalPages).toBe(3); // ceil(10/4)
    expect(clampedPage).toBe(3);
    expect(pageItems).toEqual([9, 10]);
  });

  it('clamps a page below 1 up to 1', () => {
    const { clampedPage } = paginate(list(10), 0, 5);
    expect(clampedPage).toBe(1);
  });

  it('treats an empty list as a single empty page', () => {
    const { pageItems, totalPages, clampedPage } = paginate([], 1, 50);
    expect(pageItems).toEqual([]);
    expect(totalPages).toBe(1);
    expect(clampedPage).toBe(1);
  });

  it('returns the whole list when it fits on one page', () => {
    const { pageItems, totalPages } = paginate(list(200), 1, 200);
    expect(pageItems).toHaveLength(200);
    expect(totalPages).toBe(1);
  });
});
