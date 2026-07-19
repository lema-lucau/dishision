// Read-only preview for the §5.7 Cook Complete screen — "the summary is
// editable before it commits", so nothing here writes anything. The made/
// eaten steppers call this on every change; Done/Write a log now is what
// actually calls completeCook().
import type { DbClient } from '../db/DbClient';
import type { BaseUnit } from '../seed/types';
import { computeConsumption } from './pantryConsumption';
import { computeLeftoverPlan, type LeftoverPlan } from './leftover';
import { loadIngredientsForConsumption } from './completeCook';

export interface ConsumptionPreviewLine {
  canonicalId: number;
  displayName: string;
  baseUnit: BaseUnit;
  neededBaseUnits: number;
  deductedBaseUnits: number;
  realShortfall: boolean;
  shortfallBaseUnits: number;
}

export interface CookPreview {
  lines: ConsumptionPreviewLine[];
  leftoverPlan: LeftoverPlan | null;
}

export async function previewCook(
  db: DbClient,
  recipeId: number,
  servingsMade: number,
  servingsEaten: number,
  cookedAt: string,
): Promise<CookPreview> {
  const { baseServings, ingredients } = await loadIngredientsForConsumption(db, recipeId);
  const consumption = computeConsumption(ingredients, baseServings, servingsMade);
  const byCanonicalId = new Map(ingredients.map((i) => [i.canonicalId, i]));

  const lines: ConsumptionPreviewLine[] = consumption.map((line) => {
    const ing = byCanonicalId.get(line.canonicalId)!;
    return {
      canonicalId: line.canonicalId,
      displayName: ing.displayName,
      baseUnit: ing.baseUnit,
      neededBaseUnits: line.neededBaseUnits,
      deductedBaseUnits: line.deductedBaseUnits,
      realShortfall: line.realShortfall,
      shortfallBaseUnits: line.shortfallBaseUnits,
    };
  });

  return { lines, leftoverPlan: computeLeftoverPlan(servingsMade, servingsEaten, cookedAt) };
}
