// §5.12: "View all opens their cached library using the same list
// component as the Recipes tab — identical sort and filter options, same
// filter engine (§5.3), reading from household_recipe_cache instead of
// recipe. The list component takes a data source, not a hardcoded table."
// This is that data source: household_recipe_cache rows reshaped into the
// same EnrichedRecipe contract MealSection/queryEngine already consume, so
// nothing downstream needs to know it isn't reading the recipe table.
import type { DbClient } from '../db/DbClient';
import { durationBucket } from '../lib/derive';
import type { EnrichedIngredient, EnrichedRecipe, EnrichedStep } from '../recipes/loadRecipes';
import type { SharePayload } from '../sharing/payload';

export interface HouseholdCacheRecipe extends EnrichedRecipe {
  /** The household_recipe_cache row id — distinct from any real recipe id, and never confused with one since these never enter the main library (§5.12). */
  cacheId: number;
  favouritedAt: string | null;
  payload: SharePayload;
}

interface CacheRow {
  id: number;
  share_id: string;
  payload: string;
  name: string;
  description: string | null;
  total_seconds: number | null;
  active_seconds: number | null;
  kcal_per_serving: number | null;
  cost_per_serving: number | null;
  is_favourite: number;
  favourited_at: string | null;
  synced_at: string;
}

export async function loadHouseholdCacheRecipes(db: DbClient, personId: string): Promise<HouseholdCacheRecipe[]> {
  const rows = await db.getAllAsync<CacheRow>(
    'SELECT * FROM household_recipe_cache WHERE person_id = ? ORDER BY name',
    [personId],
  );
  return rows.map((row) => {
    const payload = JSON.parse(row.payload) as SharePayload;
    const totalSeconds = row.total_seconds ?? 0;
    const activeSeconds = row.active_seconds ?? 0;

    const ingredients: EnrichedIngredient[] = payload.ingredients.map((ing, index) => ({
      id: index,
      canonicalId: null,
      canonicalName: ing.canonical_name,
      displayName: ing.display_name,
      quantity: ing.quantity,
      unit: ing.unit,
      scalable: ing.scalable,
      optional: ing.optional,
      measured: false,
      inPantry: false,
      packSize: null,
      packLabel: null,
      costUpdatedAt: null,
    }));
    const steps: EnrichedStep[] = payload.steps.map((s, index) => ({
      id: index,
      phase: s.phase,
      instruction: s.instruction,
      durationSeconds: s.duration_seconds,
      startOffsetSeconds: s.start_offset_seconds,
      effort: s.effort,
      important: s.important,
      laneName: s.lane,
    }));

    const recipe: HouseholdCacheRecipe = {
      id: row.id,
      cacheId: row.id,
      shareId: row.share_id,
      name: row.name,
      description: row.description,
      photoUri: null, // §7.4: recipe photos aren't part of household sync
      photoEmoji: payload.recipe.photo_emoji,
      visibility: 'public',
      baseServings: payload.recipe.base_servings,
      timelineMode: payload.recipe.timeline_mode,
      source: 'household_cache',
      seedId: null,
      originLabel: payload.recipe.origin_label,
      createdAt: row.synced_at,
      updatedAt: row.synced_at,
      tags: payload.tags,
      ingredients,
      steps,
      activeSeconds,
      passiveSeconds: Math.max(0, totalSeconds - activeSeconds),
      totalSeconds,
      durationBucket: durationBucket(totalSeconds),
      kcalPerServing: row.kcal_per_serving,
      proteinPerServing: null,
      carbsPerServing: null,
      fatPerServing: null,
      costPerServing: row.cost_per_serving,
      macroCompleteCount: row.kcal_per_serving != null ? ingredients.length : 0,
      costCompleteCount: row.cost_per_serving != null ? ingredients.length : 0,
      totalIngredientCount: ingredients.length,
      timesCooked: 0,
      avgRating: null,
      lastCookedAt: null,
      isFavourite: row.is_favourite === 1, // THEIR favourite flag (§2.3 DDL comment)
      exclusion: null,
      hasStaleCost: false,
      logNotes: [],
      householdRatings: [], // a cached recipe carries no synced ratings of its own
      favouritedAt: row.favourited_at,
      payload,
    };
    return recipe;
  });
}

// §5.12: "Their top 5 favourites... ordered by favourited_at DESC."
export function topFiveFavourites(recipes: HouseholdCacheRecipe[]): HouseholdCacheRecipe[] {
  return recipes
    .filter((r) => r.isFavourite)
    .sort((a, b) => (b.favouritedAt ?? '').localeCompare(a.favouritedAt ?? ''))
    .slice(0, 5);
}
