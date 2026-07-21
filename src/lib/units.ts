// Unit conversion (§3.1-3.2). The one genuinely hard problem: recipes speak
// in whatever unit is natural to write, the pantry only ever speaks in a
// canonical ingredient's base_unit. Every conversion in the app routes
// through convertToBaseUnit so there is exactly one place this logic lives.

import type { BaseUnit, RecipeUnit } from '../seed/types';

const ML_PER: Partial<Record<RecipeUnit, number>> = {
  tsp: 5,
  tbsp: 15,
  cup: 240,
  l: 1000,
};

const G_PER: Partial<Record<RecipeUnit, number>> = {
  kg: 1000,
};

export interface ConvertibleIngredient {
  baseUnit: BaseUnit;
  packSize?: number | null;
  density?: number | null;
}

export interface ConversionResult {
  /** Quantity in the ingredient's base_unit, or null when unmeasured (§3.2). */
  value: number | null;
  measured: boolean;
}

// Converts a recipe-authored quantity+unit into the canonical ingredient's
// base_unit. Returns measured:false (never guesses) when no defined
// conversion path exists — no density, no pack_size — per §3.2.
export function convertToBaseUnit(
  ingredient: ConvertibleIngredient,
  quantity: number,
  unit: RecipeUnit,
): ConversionResult {
  const { baseUnit } = ingredient;
  const density = ingredient.density ?? 1.0;

  if (unit === baseUnit) {
    return { value: quantity, measured: true };
  }

  // 'unit' base — only a literal 'unit' quantity is measured against it.
  // A pack_size lets a 'unit' recipe quantity convert the OTHER way (below),
  // but nothing converts g/ml back into a count of units.
  if (baseUnit === 'unit') {
    return { value: null, measured: false };
  }

  if (baseUnit === 'ml') {
    if (unit in ML_PER) {
      return { value: quantity * ML_PER[unit]!, measured: true };
    }
    if (unit === 'g') {
      return { value: quantity / density, measured: true };
    }
    if (unit === 'kg') {
      return { value: (quantity * G_PER.kg!) / density, measured: true };
    }
    return { value: null, measured: false };
  }

  // baseUnit === 'g'
  if (unit === 'unit') {
    if (ingredient.packSize != null) {
      return { value: quantity * ingredient.packSize, measured: true };
    }
    return { value: null, measured: false };
  }
  if (unit === 'kg') {
    return { value: quantity * G_PER.kg!, measured: true };
  }
  if (unit === 'ml') {
    return { value: quantity * density, measured: true };
  }
  if (unit in ML_PER) {
    const ml = quantity * ML_PER[unit]!;
    return { value: ml * density, measured: true };
  }

  return { value: null, measured: false };
}
