import { describe, expect, it } from 'vitest';
import { availableDisplayUnits, convertDisplayUnitToBase, formatInDisplayUnit } from '../../lib/displayUnit';

describe('availableDisplayUnits', () => {
  it('g-based ingredients can show as g, ml, tsp, tbsp, cup (density defaults to 1.0)', () => {
    const units = availableDisplayUnits({ baseUnit: 'g', packSize: null, density: null });
    expect(units).toEqual(expect.arrayContaining(['g', 'ml', 'tsp', 'tbsp', 'cup']));
    expect(units).not.toContain('unit');
  });

  it('unit-based ingredients only ever show as unit, unless a pack_size exists', () => {
    expect(availableDisplayUnits({ baseUnit: 'unit', packSize: null, density: null })).toEqual(['unit']);
    expect(availableDisplayUnits({ baseUnit: 'unit', packSize: 6, density: null })).toEqual(['unit', 'pack']);
  });

  it('adds "pack" whenever pack_size is set, regardless of base_unit', () => {
    const units = availableDisplayUnits({ baseUnit: 'g', packSize: 200, density: null });
    expect(units).toContain('pack');
  });
});

describe('formatInDisplayUnit / convertDisplayUnitToBase round-trip', () => {
  const spinach = { baseUnit: 'g' as const, packSize: 200, packLabel: 'bag', density: null };

  it('formats a base quantity as packs', () => {
    const { value, label } = formatInDisplayUnit(spinach, 500, 'pack');
    expect(value).toBe(2.5);
    expect(label).toBe('2.5 bags');
  });

  it('round-trips pack -> base -> pack', () => {
    const base = convertDisplayUnitToBase(spinach, 2.5, 'pack');
    expect(base).toBe(500);
    expect(formatInDisplayUnit(spinach, base!, 'pack').value).toBe(2.5);
  });

  it('falls back to base_unit when the target unit has no conversion path', () => {
    const eggs = { baseUnit: 'unit' as const, packSize: null, density: null };
    const { value, label } = formatInDisplayUnit(eggs, 6, 'ml');
    expect(value).toBe(6);
    expect(label).toBe('6 items');
  });
});
