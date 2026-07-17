// Derived values that must never be stored (§2.5): macros, cost, and the
// "partial data" flag they carry. All degrade honestly — a value the app
// can't compute is null, never a silent zero (§1.1).

export interface IngredientNutritionInput {
  /** Scaled quantity already converted to the canonical ingredient's base_unit, or null when unmeasured (§3.2). */
  quantityBase: number | null;
  kcalPer100: number | null;
  proteinPer100: number | null;
  carbsPer100: number | null;
  fatPer100: number | null;
  costPer100: number | null;
}

export interface NutritionDerivation {
  kcalPerServing: number | null;
  proteinPerServing: number | null;
  carbsPerServing: number | null;
  fatPerServing: number | null;
  costPerServing: number | null;
  /** Ingredients contributing to the macro figures above — the "9" in "9 of 11 ingredients". */
  macroCompleteCount: number;
  /** Ingredients contributing to the cost figure above. */
  costCompleteCount: number;
  totalIngredientCount: number;
}

type MacroField = 'kcalPer100' | 'proteinPer100' | 'carbsPer100' | 'fatPer100';
const MACRO_FIELDS: MacroField[] = ['kcalPer100', 'proteinPer100', 'carbsPer100', 'fatPer100'];

function isMacroComplete(ing: IngredientNutritionInput): boolean {
  if (ing.quantityBase == null) return false;
  return MACRO_FIELDS.every((f) => ing[f] != null);
}

function sumMacroField(ingredients: IngredientNutritionInput[], field: MacroField, baseServings: number): number | null {
  const complete = ingredients.filter(isMacroComplete);
  if (complete.length === 0) return null;
  const total = complete.reduce((acc, ing) => acc + (ing.quantityBase! / 100) * ing[field]!, 0);
  return total / baseServings;
}

export function deriveNutrition(
  ingredients: IngredientNutritionInput[],
  baseServings: number,
): NutritionDerivation {
  const totalIngredientCount = ingredients.length;
  const macroCompleteCount = ingredients.filter(isMacroComplete).length;

  const costable = ingredients.filter((ing) => ing.quantityBase != null && ing.costPer100 != null);
  const costPerServing =
    costable.length === 0
      ? null
      : costable.reduce((acc, ing) => acc + (ing.quantityBase! / 100) * ing.costPer100!, 0) / baseServings;

  return {
    kcalPerServing: sumMacroField(ingredients, 'kcalPer100', baseServings),
    proteinPerServing: sumMacroField(ingredients, 'proteinPer100', baseServings),
    carbsPerServing: sumMacroField(ingredients, 'carbsPer100', baseServings),
    fatPerServing: sumMacroField(ingredients, 'fatPer100', baseServings),
    costPerServing,
    macroCompleteCount,
    costCompleteCount: costable.length,
    totalIngredientCount,
  };
}

export interface StepTimingInput {
  effort: 'active' | 'passive';
  durationSeconds: number | null;
}

export interface TimeSplit {
  activeSeconds: number;
  passiveSeconds: number;
  totalSeconds: number;
}

// Σ duration_seconds grouped by effort (§2.5, §4.5 time split bar).
export function deriveTimeSplit(steps: StepTimingInput[]): TimeSplit {
  let activeSeconds = 0;
  let passiveSeconds = 0;
  for (const step of steps) {
    if (step.durationSeconds == null) continue;
    if (step.effort === 'passive') passiveSeconds += step.durationSeconds;
    else activeSeconds += step.durationSeconds;
  }
  return { activeSeconds, passiveSeconds, totalSeconds: activeSeconds + passiveSeconds };
}

export type DurationBucket = 'under20' | '20to40' | 'over40';

// Duration buckets for the diversity rule (§6.4): under 20 · 20-40 · over 40 min.
export function durationBucket(totalSeconds: number): DurationBucket {
  const minutes = totalSeconds / 60;
  if (minutes < 20) return 'under20';
  if (minutes <= 40) return '20to40';
  return 'over40';
}

// Pack rounding for generated shopping lines only (§3.5).
export function packRoundedQuantity(neededBaseUnits: number, packSize: number | null | undefined): number {
  if (packSize == null || packSize <= 0) return neededBaseUnits;
  const packs = Math.ceil(neededBaseUnits / packSize);
  return packs * packSize;
}
