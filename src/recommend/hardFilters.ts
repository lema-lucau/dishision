// §6.2 hard filters — applied before scoring, every one of them a hard cut
// (no recipe surviving a filter here is ever scored, unlike the chip
// filters in queryEngine.ts which are the picker's soft/relaxable layer).
import { isExcludedNow } from '../recipes/queryEngine';
import { recipePrimaryProtein, type EnrichedRecipe } from '../recipes/loadRecipes';
import { isAllowedByCategories, type MealCategory } from './mealCategories';

export interface HardFilterContext {
  now: number;
  /** The recency window currently being tried by the relaxation ladder (§6.3). 0 disables the recency filter. */
  recencyWindowDays: number;
  /** Primary protein tag of whatever was cooked yesterday, or null when nothing was cooked yesterday or it carried no protein tag (§6.2: exempt in both cases). */
  yesterdaysPrimaryProtein: string | null;
  /** Meal categories the user allows the engine to suggest. Omitted/all-four/empty = no restriction. */
  allowedCategories?: MealCategory[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function applyHardFilters(recipes: EnrichedRecipe[], ctx: HardFilterContext): EnrichedRecipe[] {
  return recipes.filter((recipe) => {
    if (isExcludedNow(recipe, ctx.now)) return false;

    if (!isAllowedByCategories(recipe, ctx.allowedCategories ?? [])) return false;

    if (ctx.recencyWindowDays > 0 && recipe.lastCookedAt) {
      const daysSince = (ctx.now - new Date(recipe.lastCookedAt).getTime()) / MS_PER_DAY;
      if (daysSince < ctx.recencyWindowDays) return false;
    }

    if (ctx.yesterdaysPrimaryProtein) {
      const protein = recipePrimaryProtein(recipe);
      if (protein != null && protein === ctx.yesterdaysPrimaryProtein) return false;
    }

    return true;
  });
}
