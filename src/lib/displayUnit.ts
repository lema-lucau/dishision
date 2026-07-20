// Pantry display-unit conversion (Planning-screen improvements: "keep the
// unit default value but allow the user to click on the unit and get a
// dropdown"). pantry_item.quantity is ALWAYS stored in base units (§3.1,
// unchanged) — everything here is display-only maths layered on top, never
// written back except through the base-unit path in pantryMutations.ts.
import { convertToBaseUnit, type ConvertibleIngredient } from './units';
import { pluralizeUnit } from './unitLabels';
import type { RecipeUnit } from '../seed/types';

export type DisplayUnit = RecipeUnit | 'pack';

const CANDIDATE_UNITS: RecipeUnit[] = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'unit'];

// Which units this specific ingredient can legally be displayed in — g/ml
// convert freely between each other and the volume units (density defaults
// to 1.0, §3.2), but 'unit' only ever converts when a pack_size exists, and
// a 'unit'-based ingredient can only ever show as 'unit'.
export function availableDisplayUnits(ingredient: ConvertibleIngredient): DisplayUnit[] {
  const units = CANDIDATE_UNITS.filter((u) => convertToBaseUnit(ingredient, 1, u).measured);
  const result: DisplayUnit[] = [...units];
  if (ingredient.packSize != null && ingredient.packSize > 0) result.push('pack');
  return result;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface DisplayQuantity {
  value: number;
  label: string;
}

// Converts a base-unit quantity into the requested display unit. Falls back
// to the ingredient's own base_unit if the requested unit has no valid
// conversion for it (should only happen if a preference goes stale after an
// ingredient's density/pack_size changes).
export function formatInDisplayUnit(
  ingredient: ConvertibleIngredient & { packLabel?: string | null },
  baseQuantity: number,
  targetUnit: DisplayUnit,
): DisplayQuantity {
  if (targetUnit === 'pack' && ingredient.packSize != null && ingredient.packSize > 0) {
    const value = round2(baseQuantity / ingredient.packSize);
    const label = ingredient.packLabel
      ? `${value} ${ingredient.packLabel}${value === 1 ? '' : 's'}`
      : `${value} ${pluralizeUnit(value, 'pack')}`;
    return { value, label };
  }
  const probe = convertToBaseUnit(ingredient, 1, targetUnit as RecipeUnit);
  if (probe.measured && probe.value) {
    const value = round2(baseQuantity / probe.value);
    return { value, label: `${value} ${pluralizeUnit(value, targetUnit)}` };
  }
  const value = round2(baseQuantity);
  return { value, label: `${value} ${pluralizeUnit(value, ingredient.baseUnit)}` };
}

// The inverse — a value typed in `fromUnit` back into base units, for
// writing to pantry_item.quantity (always base units, no exceptions).
export function convertDisplayUnitToBase(
  ingredient: ConvertibleIngredient,
  value: number,
  fromUnit: DisplayUnit,
): number | null {
  if (fromUnit === 'pack') {
    if (ingredient.packSize == null || ingredient.packSize <= 0) return null;
    return value * ingredient.packSize;
  }
  const conversion = convertToBaseUnit(ingredient, value, fromUnit as RecipeUnit);
  return conversion.measured ? conversion.value : null;
}
