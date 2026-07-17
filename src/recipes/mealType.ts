// Meal-type grouping for the Recipes tab's collapsible sections. Backed by
// the 'meal' tag type (breakfast/lunch/dinner/dessert) rather than a schema
// column — a recipe can carry more than one, so priority order below picks
// a single section deterministically. No meal tag at all defaults to
// 'dinner', since that's the app's core scope (§1).
import type { EnrichedRecipe } from './loadRecipes';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'dessert';

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'dessert'];

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  dessert: 'Dessert',
};

export function recipeMealType(recipe: EnrichedRecipe): MealType {
  for (const mealType of MEAL_TYPES) {
    if (recipe.tags.includes(mealType)) return mealType;
  }
  return 'dinner';
}
