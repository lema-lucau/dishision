// One place that turns a recipe into what <RecipePhoto> needs (redesign R4/R5).
// It was already duplicated inline on Home and in Exclusions; now that photos
// actually exist on recipes, every tile in the app needs it, so it lives here.
import type { RecipePhotoSubject } from '../components/ui';
import type { CategoryKey } from '../theme/tokens';
import { recipePrimaryProtein, type EnrichedRecipe } from './loadRecipes';

export function recipePhotoSubject(recipe: EnrichedRecipe): RecipePhotoSubject {
  return {
    photoUri: recipe.photoUri,
    photoEmoji: recipe.photoEmoji,
    // The protein tag drives the fallback tint (base §4.4); 'other' is the
    // honest answer for anything untagged, not a failure case.
    category: (recipePrimaryProtein(recipe) as CategoryKey | null) ?? 'other',
  };
}
