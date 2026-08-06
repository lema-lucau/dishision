// Meal-category recommender filter (user setting): restrict what the engine
// surfaces to a chosen set of Breakfast / Lunch / Dinner / Dessert. A recipe's
// category comes from its tags (the seed vocabulary already carries
// breakfast/lunch/dinner/dessert) — there's no separate column, so this reads
// the tags a recipe already has rather than adding schema.
//
// Pure and DB-free so the set logic is unit-testable; the setting read/write
// lives in getSetting/setSetting and the wiring in hardFilters + dailyCache.
import type { EnrichedRecipe } from '../recipes/loadRecipes';

export type MealCategory = 'breakfast' | 'lunch' | 'dinner' | 'dessert';

export const MEAL_CATEGORIES: MealCategory[] = ['breakfast', 'lunch', 'dinner', 'dessert'];

export const MEAL_CATEGORY_LABELS: Record<MealCategory, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  dessert: 'Dessert',
};

const CATEGORY_SET = new Set<string>(MEAL_CATEGORIES);

// Tags are stored capitalised in the DB ('Dinner') but every comparison in the
// app is case-insensitive against a lowercase needle (queryEngine.hasTag) — so
// this normalises the same way. Getting this wrong filters out *everything*,
// since 'Dinner' !== 'dinner'.
function normaliseTags(tags: string[]): string[] {
  return tags.map((t) => t.toLowerCase());
}

// The meal-category tags a recipe carries (a recipe can legitimately be both
// lunch and dinner). Tags outside the four categories are ignored here.
export function recipeMealCategories(recipe: EnrichedRecipe): MealCategory[] {
  return normaliseTags(recipe.tags).filter((t): t is MealCategory => CATEGORY_SET.has(t));
}

// Whether a recipe is allowed under the current selection. The all-selected
// case is treated as "no restriction" — it must pass EVERY recipe, including
// ones with no meal-category tag at all, so the default never silently hides
// the untagged half of the library. Once the selection narrows, a recipe has
// to carry at least one of the chosen categories to survive.
export function isAllowedByCategories(recipe: EnrichedRecipe, allowed: MealCategory[]): boolean {
  if (allowed.length === 0 || allowed.length === MEAL_CATEGORIES.length) return true;
  const allowedSet = new Set<string>(allowed);
  return normaliseTags(recipe.tags).some((t) => allowedSet.has(t));
}

// Parse/sanitise a stored CSV into a valid selection. Unknown tokens are
// dropped; an empty result falls back to "all" so the engine is never left
// with nothing to recommend (the UI enforces ≥1, but a hand-edited or
// corrupted value shouldn't brick recommendations).
export function parseMealCategories(raw: string | null): MealCategory[] {
  if (raw == null || raw.trim() === '') return [...MEAL_CATEGORIES];
  const parsed = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is MealCategory => CATEGORY_SET.has(s));
  return parsed.length > 0 ? parsed : [...MEAL_CATEGORIES];
}
