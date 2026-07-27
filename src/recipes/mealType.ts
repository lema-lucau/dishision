// Meal-type grouping for the Recipes tab's collapsible sections. Backed by
// the 'meal' tag type (breakfast/lunch/dinner/dessert) rather than a schema
// column — a recipe can carry more than one, so priority order below picks
// a single section deterministically. No meal tag at all defaults to
// 'dinner', since that's the app's core scope (§1).
import type { EnrichedRecipe } from './loadRecipes';
import { hasTag } from './queryEngine';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'dessert';

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'dessert'];

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  dessert: 'Dessert',
};

export function recipeMealType(recipe: EnrichedRecipe): MealType {
  return sectionFromTags(recipe.tags);
}

// ── Section control (§5.4.1) ───────────────────────────────────────────────
// The recipe form edits a recipe's section directly instead of leaving the
// cook to guess which free-text tag drives the grouping. These are pure tag
// operations: the section IS the meal tag, so there is no schema column, no
// migration, and the share envelope's tag list carries it unchanged.

export function isMealTag(tag: string): boolean {
  return MEAL_TYPES.some((m) => m === tag.toLowerCase());
}

/** The section a tag list resolves to. Priority order breaks ties; no meal
 *  tag at all means Dinner (the app's core scope, §1). */
export function sectionFromTags(tags: string[]): MealType {
  for (const mealType of MEAL_TYPES) {
    if (hasTag(tags, mealType)) return mealType;
  }
  return 'dinner';
}

/** Sets the section, mutually exclusively — every other meal tag is stripped,
 *  so a recipe can never appear in two sections. Non-meal tags keep their
 *  order, and the new tag lands at the front where the section belongs. */
export function withSection(tags: string[], section: MealType): string[] {
  const rest = tags.filter((t) => !isMealTag(t));
  return [MEAL_TYPE_LABELS[section], ...rest];
}
