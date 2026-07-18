// §5.7 consumption rules, as pure logic so the real-shortfall rule can be
// unit-tested without a database. An ingredient only ever appears here when
// it's measurable (canonical + convertible) AND the pantry already had a row
// for it — an ingredient the pantry never knew about is not a shortfall and
// must never surface as one (that's the exact bug this rule exists to
// prevent, per §15/§11.2).
import { scaleQuantity } from '../lib/scaling';
import { convertToBaseUnit, type ConvertibleIngredient } from '../lib/units';
import type { RecipeUnit } from '../seed/types';

export interface ConsumptionIngredientInput extends ConvertibleIngredient {
  canonicalId: number | null;
  quantity: number;
  unit: RecipeUnit;
  scalable: boolean;
  /** null when the pantry has no row for this canonical ingredient at all. */
  pantryQuantity: number | null;
}

export interface ConsumptionLine {
  canonicalId: number;
  neededBaseUnits: number;
  /** Amount actually removed from the pantry row — capped at what was there. */
  deductedBaseUnits: number;
  remainingPantryQuantity: number;
  realShortfall: boolean;
  shortfallBaseUnits: number;
}

// Ingredients scaled to servings_made (§5.7 — you used what you cooked for,
// regardless of how many people actually ate), converted to base units, and
// matched against an existing pantry row. Unmeasured ingredients and
// ingredients with no pantry row are silently skipped — nothing to deduct,
// nothing to flag.
export function computeConsumption(
  ingredients: ConsumptionIngredientInput[],
  baseServings: number,
  servingsMade: number,
): ConsumptionLine[] {
  const lines: ConsumptionLine[] = [];
  for (const ing of ingredients) {
    if (ing.canonicalId == null || ing.pantryQuantity == null) continue;

    const scaledQty = scaleQuantity(ing.quantity, ing.scalable, baseServings, servingsMade);
    const conversion = convertToBaseUnit(ing, scaledQty, ing.unit);
    if (!conversion.measured || conversion.value == null) continue;

    const needed = conversion.value;
    const available = ing.pantryQuantity;
    const deducted = Math.min(needed, available);
    const remaining = available - deducted;
    const shortfall = needed - deducted;

    lines.push({
      canonicalId: ing.canonicalId,
      neededBaseUnits: needed,
      deductedBaseUnits: deducted,
      remainingPantryQuantity: remaining,
      realShortfall: shortfall > 0,
      shortfallBaseUnits: shortfall,
    });
  }
  return lines;
}
