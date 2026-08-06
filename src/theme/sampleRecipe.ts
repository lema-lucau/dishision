// A fixed sample recipe for the theme picker's live preview (§4.10 step 2).
// Deliberately NOT the person's own data — consistent content across themes
// makes the comparison fair, and it works on a fresh install before any real
// recipe exists. It's the Thai Green Curry used throughout the spec's mockups.
import type { EnrichedRecipe } from '../recipes/loadRecipes';

export const SAMPLE_RECIPE: EnrichedRecipe = {
  id: -1,
  shareId: 'sample-preview',
  name: 'Thai Green Curry',
  description: 'Weeknight staple.',
  photoUri: null,
  photoEmoji: '🍛',
  visibility: 'private',
  baseServings: 2,
  timelineMode: 'sequential',
  source: 'seed',
  seedId: 'sample-preview',
  originLabel: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  tags: ['chicken'],
  ingredients: [
    { id: 1, canonicalId: 1, canonicalName: 'Chicken thigh', displayName: 'Chicken thigh', quantity: 400, unit: 'g', scalable: true, optional: false, measured: true, inPantry: true, packSize: null, packLabel: null, costUpdatedAt: null },
    { id: 2, canonicalId: 2, canonicalName: 'Coconut milk', displayName: 'Coconut milk', quantity: 400, unit: 'ml', scalable: true, optional: false, measured: true, inPantry: true, packSize: null, packLabel: null, costUpdatedAt: null },
    { id: 3, canonicalId: 3, canonicalName: 'Green curry paste', displayName: 'Green curry paste', quantity: 3, unit: 'tbsp', scalable: true, optional: false, measured: true, inPantry: false, packSize: null, packLabel: null, costUpdatedAt: null },
    { id: 4, canonicalId: 4, canonicalName: 'Thai basil', displayName: 'Thai basil', quantity: 1, unit: 'unit', scalable: false, optional: true, measured: false, inPantry: true, packSize: null, packLabel: null, costUpdatedAt: null },
  ],
  steps: [
    { id: 1, phase: 'prep', instruction: 'Dice the chicken thigh', durationSeconds: 300, startOffsetSeconds: 0, effort: 'active', important: false, laneName: null },
    { id: 2, phase: 'cook', instruction: 'Fry the curry paste until fragrant', durationSeconds: 120, startOffsetSeconds: 300, effort: 'active', important: false, laneName: null },
    { id: 3, phase: 'cook', instruction: 'Add coconut milk and simmer', durationSeconds: 1080, startOffsetSeconds: 420, effort: 'passive', important: true, laneName: null },
  ],
  activeSeconds: 840,
  passiveSeconds: 1080,
  totalSeconds: 1920,
  durationBucket: '20to40',
  kcalPerServing: 612,
  proteinPerServing: 38,
  carbsPerServing: 21,
  fatPerServing: 41,
  costPerServing: 4.2,
  macroCompleteCount: 3,
  costCompleteCount: 3,
  totalIngredientCount: 4,
  timesCooked: 7,
  avgRating: 4.5,
  lastCookedAt: '2026-06-01T00:00:00.000Z',
  isFavourite: false,
  exclusion: null,
  hasStaleCost: false,
  logNotes: [],
  householdRatings: [],
};
