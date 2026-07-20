import { describe, expect, it } from 'vitest';
import { convertToBaseUnit } from '../../lib/units';

describe('convertToBaseUnit (§3.2)', () => {
  it('passes through when unit already matches base_unit', () => {
    expect(convertToBaseUnit({ baseUnit: 'g' }, 400, 'g')).toEqual({ value: 400, measured: true });
    expect(convertToBaseUnit({ baseUnit: 'ml' }, 250, 'ml')).toEqual({ value: 250, measured: true });
    expect(convertToBaseUnit({ baseUnit: 'unit' }, 2, 'unit')).toEqual({ value: 2, measured: true });
  });

  it('converts tsp/tbsp/cup to ml', () => {
    expect(convertToBaseUnit({ baseUnit: 'ml' }, 1, 'tsp')).toEqual({ value: 5, measured: true });
    expect(convertToBaseUnit({ baseUnit: 'ml' }, 1, 'tbsp')).toEqual({ value: 15, measured: true });
    expect(convertToBaseUnit({ baseUnit: 'ml' }, 1, 'cup')).toEqual({ value: 240, measured: true });
  });

  it('converts ml to g via density, default density 1.0', () => {
    expect(convertToBaseUnit({ baseUnit: 'g' }, 100, 'ml')).toEqual({ value: 100, measured: true });
    expect(convertToBaseUnit({ baseUnit: 'g', density: 0.92 }, 100, 'ml')).toEqual({ value: 92, measured: true });
  });

  it('converts unit to g via pack_size', () => {
    expect(convertToBaseUnit({ baseUnit: 'g', packSize: 60 }, 2, 'unit')).toEqual({ value: 120, measured: true });
  });

  it('is unmeasured when no density/pack_size path exists', () => {
    expect(convertToBaseUnit({ baseUnit: 'g' }, 2, 'unit')).toEqual({ value: null, measured: false });
    expect(convertToBaseUnit({ baseUnit: 'unit' }, 100, 'g')).toEqual({ value: null, measured: false });
    expect(convertToBaseUnit({ baseUnit: 'unit' }, 1, 'tsp')).toEqual({ value: null, measured: false });
  });

  it('converts tsp/tbsp/cup through to g when base_unit is g (via ml then density)', () => {
    expect(convertToBaseUnit({ baseUnit: 'g' }, 2, 'tbsp')).toEqual({ value: 30, measured: true });
    expect(convertToBaseUnit({ baseUnit: 'g', density: 1.4 }, 1, 'tbsp')).toEqual({ value: 21, measured: true });
  });

  it('converts kg to g and l to ml', () => {
    expect(convertToBaseUnit({ baseUnit: 'g' }, 1.5, 'kg')).toEqual({ value: 1500, measured: true });
    expect(convertToBaseUnit({ baseUnit: 'ml' }, 1.5, 'l')).toEqual({ value: 1500, measured: true });
  });

  it('converts kg through to ml via density, and l through to g via density', () => {
    expect(convertToBaseUnit({ baseUnit: 'ml', density: 0.5 }, 1, 'kg')).toEqual({ value: 2000, measured: true });
    expect(convertToBaseUnit({ baseUnit: 'g', density: 0.5 }, 1, 'l')).toEqual({ value: 500, measured: true });
  });
});
