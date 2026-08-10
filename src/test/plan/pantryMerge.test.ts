import { describe, expect, it } from 'vitest';
import { mergePantryAndStaples } from '../../plan/pantryMerge';
import type { PantryItemRow } from '../../plan/pantryMutations';
import type { StapleRow } from '../../plan/staples';

function pantryItem(over: Partial<PantryItemRow> & { canonicalId: number; name: string }): PantryItemRow {
  return {
    quantity: 100,
    baseUnit: 'g',
    packSize: null,
    packLabel: null,
    density: null,
    category: 'other',
    isStaple: false,
    preferredUnit: null,
    updatedAt: '',
    ...over,
  };
}

function staple(over: Partial<StapleRow> & { canonicalId: number; name: string }): StapleRow {
  return {
    baseUnit: 'g',
    category: 'other',
    quantity: 0,
    parLevel: null,
    manualRunningLow: false,
    runningLow: false,
    ...over,
  };
}

describe('mergePantryAndStaples', () => {
  it('unions pantry items and staples with no double entries', () => {
    const rows = mergePantryAndStaples(
      [pantryItem({ canonicalId: 1, name: 'flour', isStaple: true }), pantryItem({ canonicalId: 2, name: 'spinach' })],
      [staple({ canonicalId: 1, name: 'flour', parLevel: 500, runningLow: true }), staple({ canonicalId: 3, name: 'salt' })],
    );
    expect(rows.map((r) => r.canonicalId).sort()).toEqual([1, 2, 3]);
  });

  it('carries staple par-level/running-low onto a stocked staple', () => {
    const [row] = mergePantryAndStaples(
      [pantryItem({ canonicalId: 1, name: 'flour', isStaple: true, quantity: 200 })],
      [staple({ canonicalId: 1, name: 'flour', parLevel: 500, runningLow: true })],
    );
    expect(row.hasStock).toBe(true);
    expect(row.quantity).toBe(200);
    expect(row.parLevel).toBe(500);
    expect(row.runningLow).toBe(true);
  });

  it('adds a synthetic zero-stock entry for a staple with no pantry row', () => {
    const rows = mergePantryAndStaples([], [staple({ canonicalId: 3, name: 'salt', parLevel: 50 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ canonicalId: 3, name: 'salt', hasStock: false, quantity: 0, isStaple: true, parLevel: 50 });
  });
});
