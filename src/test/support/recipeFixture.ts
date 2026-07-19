// Shared EnrichedRecipe fixture builder for pure-logic tests that don't need
// a database (§11.2). Mirrors the inline builder in
// src/test/recipes/queryEngine.test.ts — factored out here so the
// recommendation-engine tests (src/test/recommend/*) don't each re-declare it.
import type { EnrichedRecipe } from '../../recipes/loadRecipes';

let nextId = 1;

export function resetRecipeFixtureIds(): void {
  nextId = 1;
}

export function makeRecipe(overrides: Partial<EnrichedRecipe> = {}): EnrichedRecipe {
  const id = overrides.id ?? nextId++;
  return {
    id,
    shareId: `share-${id}`,
    name: `Recipe ${id}`,
    description: null,
    photoUri: null,
    photoEmoji: '🍛',
    visibility: 'private',
    baseServings: 2,
    timelineMode: 'sequential',
    source: 'manual',
    seedId: null,
    originLabel: null,
    createdAt: new Date(2026, 0, id).toISOString(),
    updatedAt: new Date(2026, 0, id).toISOString(),
    tags: [],
    ingredients: [],
    steps: [],
    activeSeconds: 600,
    passiveSeconds: 0,
    totalSeconds: 600,
    durationBucket: 'under20',
    kcalPerServing: 400,
    proteinPerServing: 20,
    carbsPerServing: 40,
    fatPerServing: 10,
    costPerServing: 2,
    macroCompleteCount: 1,
    costCompleteCount: 1,
    totalIngredientCount: 1,
    timesCooked: 0,
    avgRating: null,
    lastCookedAt: null,
    isFavourite: false,
    exclusion: null,
    hasStaleCost: false,
    logNotes: [],
    ...overrides,
  };
}
