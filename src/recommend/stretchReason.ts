// §5.3 relax-to-boost labelling: a short, honest reason a backfilled item
// didn't actually clear the selected chips — mirrors the spec's own example
// in shape: "Closest match — 24 min, not under 20". Pure and RN-free (kept
// out of FeelingPickerSheet.tsx, which pulls in react-native and can't be
// unit-tested under plain Vitest) so this logic is directly testable.
import type { EnrichedRecipe } from '../recipes/loadRecipes';
import { hasTag, type ChipKey } from '../recipes/queryEngine';

export function stretchReason(recipe: EnrichedRecipe, chips: ChipKey[], medianCostPerServing: number | null): string | null {
  for (const chip of chips) {
    switch (chip) {
      case 'quick':
        if (recipe.totalSeconds >= 20 * 60) return `${Math.round(recipe.totalSeconds / 60)} min, not under 20`;
        break;
      case 'lowEffort':
        if (recipe.activeSeconds >= 15 * 60) return `${Math.round(recipe.activeSeconds / 60)} min hands-on, not under 15`;
        break;
      case 'healthy':
        if (!hasTag(recipe.tags, 'healthy')) return 'not tagged healthy';
        break;
      case 'comfort':
        if (!hasTag(recipe.tags, 'comfort')) return 'not tagged comfort';
        break;
      case 'highProtein':
        if (recipe.proteinPerServing == null || recipe.proteinPerServing < 30) {
          return recipe.proteinPerServing == null ? 'no protein data' : `${Math.round(recipe.proteinPerServing)}g protein, not 30+`;
        }
        break;
      case 'lowKcal':
        if (recipe.kcalPerServing == null || recipe.kcalPerServing >= 500) {
          return recipe.kcalPerServing == null ? 'no calorie data' : `${Math.round(recipe.kcalPerServing)} kcal, not under 500`;
        }
        break;
      case 'chicken':
      case 'beef':
      case 'pork':
      case 'lamb':
      case 'fish':
      case 'veg':
        if (!hasTag(recipe.tags, chip)) return `not tagged ${chip}`;
        break;
      case 'cheap':
        if (recipe.costPerServing == null || medianCostPerServing == null || recipe.costPerServing >= medianCostPerServing) {
          return recipe.costPerServing == null ? 'no cost data' : 'above the median cost';
        }
        break;
      case 'usesWhatIHave': {
        const missing = recipe.ingredients.filter((i) => !i.optional && !i.inPantry).length;
        if (missing > 0) return `missing ${missing} ingredient${missing === 1 ? '' : 's'}`;
        break;
      }
    }
  }
  return null;
}
