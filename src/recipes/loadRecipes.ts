// Loads the full recipe library plus everything the derived values (§2.5),
// scaling (§3.4), and chip rules (§5.3) need, in one place. Both the Recipes
// tab and the recipe detail screen read through this — one source of truth
// for "what does this recipe look like right now."
import type { DbClient } from '../db/DbClient';
import { deriveNutrition, deriveTimeSplit, durationBucket, type DurationBucket } from '../lib/derive';
import { convertToBaseUnit } from '../lib/units';
import { deriveCostPer100, effectiveCostPer100, loadPricesForCanonicalIds } from './ingredientPrices';
import { primaryProteinTag } from './queryEngine';
import type { RecipeUnit } from '../seed/types';

interface RecipeRow {
  id: number;
  share_id: string;
  name: string;
  description: string | null;
  photo_uri: string | null;
  photo_emoji: string;
  visibility: string;
  base_servings: number;
  timeline_mode: string;
  source: string;
  seed_id: string | null;
  origin_label: string | null;
  origin_url: string | null;
  created_at: string;
  updated_at: string;
}

interface RecipeIngredientRow {
  id: number;
  recipe_id: number;
  canonical_id: number | null;
  display_name: string;
  quantity: number;
  unit: RecipeUnit;
  scalable: number;
  optional: number;
  sort_order: number;
  canon_name: string | null;
  base_unit: 'g' | 'ml' | 'unit' | null;
  pack_size: number | null;
  pack_label: string | null;
  kcal_per_100: number | null;
  protein_per_100: number | null;
  carbs_per_100: number | null;
  fat_per_100: number | null;
  cost_per_100: number | null;
  cost_updated_at: string | null;
  density: number | null;
}

interface RecipeStepRow {
  id: number;
  recipe_id: number;
  lane_id: number | null;
  phase: 'prep' | 'cook';
  instruction: string;
  duration_seconds: number | null;
  start_offset_seconds: number;
  effort: 'active' | 'passive';
  important: number;
  sort_order: number;
}

interface StepLaneRow {
  id: number;
  recipe_id: number;
  name: string;
  sort_order: number;
}

interface RecipeTagRow {
  recipe_id: number;
  name: string;
  type: string;
}

interface CookStatsRow {
  recipe_id: number;
  times_cooked: number;
  avg_stars: number | null;
  last_cooked_at: string | null;
}

export interface EnrichedIngredient {
  id: number;
  canonicalId: number | null;
  canonicalName: string | null;
  displayName: string;
  quantity: number;
  unit: RecipeUnit;
  scalable: boolean;
  optional: boolean;
  measured: boolean;
  inPantry: boolean;
  packSize: number | null;
  packLabel: string | null;
  costUpdatedAt: string | null;
}

export interface EnrichedStep {
  id: number;
  phase: 'prep' | 'cook';
  instruction: string;
  durationSeconds: number | null;
  /** Authored for parallel recipes; derived at read time (cumulative prior durations) for sequential ones (§5.6). */
  startOffsetSeconds: number;
  effort: 'active' | 'passive';
  important: boolean;
  laneName: string | null;
}

export interface EnrichedRecipe {
  id: number;
  shareId: string;
  name: string;
  description: string | null;
  photoUri: string | null;
  photoEmoji: string;
  visibility: string;
  baseServings: number;
  timelineMode: 'sequential' | 'parallel';
  source: string;
  seedId: string | null;
  originLabel: string | null;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  ingredients: EnrichedIngredient[];
  steps: EnrichedStep[];
  activeSeconds: number;
  passiveSeconds: number;
  totalSeconds: number;
  durationBucket: DurationBucket;
  kcalPerServing: number | null;
  proteinPerServing: number | null;
  carbsPerServing: number | null;
  fatPerServing: number | null;
  costPerServing: number | null;
  macroCompleteCount: number;
  costCompleteCount: number;
  totalIngredientCount: number;
  timesCooked: number;
  avgRating: number | null;
  lastCookedAt: string | null;
  isFavourite: boolean;
  exclusion: { kind: 'never_again' | 'not_tonight'; expiresAt: string | null } | null;
  hasStaleCost: boolean;
  /** Private log text (§5.4 search) — never leaves the device, never included in a share payload. */
  logNotes: string[];
}

export async function loadEnrichedRecipes(
  db: DbClient,
  costStalenessDays = 90,
): Promise<EnrichedRecipe[]> {
  const recipeRows = await db.getAllAsync<RecipeRow>('SELECT * FROM recipe ORDER BY name');
  if (recipeRows.length === 0) return [];

  const ingredientRows = await db.getAllAsync<RecipeIngredientRow>(
    `SELECT ri.*, ci.name as canon_name, ci.base_unit, ci.pack_size, ci.pack_label,
            ci.kcal_per_100, ci.protein_per_100, ci.carbs_per_100, ci.fat_per_100,
            ci.cost_per_100, ci.cost_updated_at, ci.density
     FROM recipe_ingredient ri
     LEFT JOIN canonical_ingredient ci ON ci.id = ri.canonical_id
     ORDER BY ri.recipe_id, ri.sort_order`,
  );

  // Manual ingredient prices (§ cost per serving) take priority over the
  // stored cost_per_100 fallback (seed data, or a flat figure from the older
  // Cost Refresh screen) — computed live here rather than trusting a stored
  // column, so it never drifts from the underlying price points.
  const priceableByCanonical = new Map<number, { baseUnit: 'g' | 'ml' | 'unit'; packSize: number | null; density: number | null }>();
  for (const row of ingredientRows) {
    if (row.canonical_id != null && row.base_unit != null && !priceableByCanonical.has(row.canonical_id)) {
      priceableByCanonical.set(row.canonical_id, { baseUnit: row.base_unit, packSize: row.pack_size, density: row.density });
    }
  }
  const pricedCanonicalIds = [...priceableByCanonical.keys()];
  const pricesByCanonical = await loadPricesForCanonicalIds(db, pricedCanonicalIds);
  const manualCostByCanonical = new Map<number, number | null>();
  const manualFreshAtByCanonical = new Map<number, string | null>();
  for (const id of pricedCanonicalIds) {
    const points = pricesByCanonical.get(id) ?? [];
    const manual = deriveCostPer100(priceableByCanonical.get(id)!, points);
    manualCostByCanonical.set(id, manual);
    if (manual != null) {
      manualFreshAtByCanonical.set(id, points.reduce<string | null>((max, p) => (max == null || p.createdAt > max ? p.createdAt : max), null));
    }
  }
  const stepRows = await db.getAllAsync<RecipeStepRow>(
    'SELECT * FROM recipe_step ORDER BY recipe_id, sort_order',
  );
  const laneRows = await db.getAllAsync<StepLaneRow>(
    'SELECT * FROM step_lane ORDER BY recipe_id, sort_order',
  );
  const tagRows = await db.getAllAsync<RecipeTagRow>(
    `SELECT rt.recipe_id, t.name, t.type
     FROM recipe_tag rt JOIN tag t ON t.id = rt.tag_id`,
  );
  const cookStats = await db.getAllAsync<CookStatsRow>(
    `SELECT recipe_id,
            COUNT(*) as times_cooked,
            AVG(stars) as avg_stars,
            MAX(cooked_at) as last_cooked_at
     FROM cook_log
     WHERE completed = 1
     GROUP BY recipe_id`,
  );
  const favouriteRows = await db.getAllAsync<{ recipe_id: number }>('SELECT recipe_id FROM favourite');
  const exclusionRows = await db.getAllAsync<{
    recipe_id: number;
    kind: 'never_again' | 'not_tonight';
    expires_at: string | null;
  }>('SELECT recipe_id, kind, expires_at FROM recipe_exclusion');
  const pantryRows = await db.getAllAsync<{ canonical_id: number; quantity: number }>(
    'SELECT canonical_id, quantity FROM pantry_item',
  );
  const stapleRows = await db.getAllAsync<{ canonical_id: number }>('SELECT canonical_id FROM staple');
  const logRows = await db.getAllAsync<{
    recipe_id: number;
    notes: string | null;
    what_went_well: string | null;
    what_to_change: string | null;
  }>('SELECT recipe_id, notes, what_went_well, what_to_change FROM cook_log');

  const logNotesByRecipe = new Map<number, string[]>();
  for (const row of logRows) {
    const list = logNotesByRecipe.get(row.recipe_id) ?? [];
    for (const text of [row.notes, row.what_went_well, row.what_to_change]) {
      if (text) list.push(text);
    }
    logNotesByRecipe.set(row.recipe_id, list);
  }

  const pantryByIngredient = new Map(pantryRows.map((r) => [r.canonical_id, r.quantity]));
  const stapleIds = new Set(stapleRows.map((r) => r.canonical_id));
  const favouriteIds = new Set(favouriteRows.map((r) => r.recipe_id));
  const exclusionByRecipe = new Map(exclusionRows.map((r) => [r.recipe_id, r]));
  const cookStatsByRecipe = new Map(cookStats.map((r) => [r.recipe_id, r]));

  const ingredientsByRecipe = new Map<number, RecipeIngredientRow[]>();
  for (const row of ingredientRows) {
    const list = ingredientsByRecipe.get(row.recipe_id) ?? [];
    list.push(row);
    ingredientsByRecipe.set(row.recipe_id, list);
  }
  const stepsByRecipe = new Map<number, RecipeStepRow[]>();
  for (const row of stepRows) {
    const list = stepsByRecipe.get(row.recipe_id) ?? [];
    list.push(row);
    stepsByRecipe.set(row.recipe_id, list);
  }
  const laneNameById = new Map(laneRows.map((l) => [l.id, l.name]));
  const tagsByRecipe = new Map<number, string[]>();
  for (const row of tagRows) {
    const list = tagsByRecipe.get(row.recipe_id) ?? [];
    list.push(row.name);
    tagsByRecipe.set(row.recipe_id, list);
  }

  const staleCutoff = Date.now() - costStalenessDays * 24 * 60 * 60 * 1000;

  return recipeRows.map((recipe) => {
    const rawIngredients = ingredientsByRecipe.get(recipe.id) ?? [];
    const tags = tagsByRecipe.get(recipe.id) ?? [];
    const steps = stepsByRecipe.get(recipe.id) ?? [];

    const enrichedIngredients: EnrichedIngredient[] = rawIngredients.map((ing) => {
      if (ing.canonical_id == null || ing.base_unit == null) {
        return {
          id: ing.id,
          canonicalId: null,
          canonicalName: null,
          displayName: ing.display_name,
          quantity: ing.quantity,
          unit: ing.unit,
          scalable: ing.scalable === 1,
          optional: ing.optional === 1,
          measured: false,
          inPantry: false,
          packSize: null,
          packLabel: null,
          costUpdatedAt: null,
        };
      }
      const conversion = convertToBaseUnit(
        { baseUnit: ing.base_unit, packSize: ing.pack_size, density: ing.density },
        ing.quantity,
        ing.unit,
      );
      const isStaple = stapleIds.has(ing.canonical_id);
      const pantryQty = pantryByIngredient.get(ing.canonical_id);
      const inPantry = isStaple
        ? true
        : conversion.measured
          ? (pantryQty ?? 0) >= (conversion.value ?? 0)
          : pantryQty != null;

      const manualCost = manualCostByCanonical.get(ing.canonical_id) ?? null;
      const costUpdatedAt = manualCost != null ? manualFreshAtByCanonical.get(ing.canonical_id) ?? ing.cost_updated_at : ing.cost_updated_at;

      return {
        id: ing.id,
        canonicalId: ing.canonical_id,
        canonicalName: ing.canon_name,
        displayName: ing.display_name,
        quantity: ing.quantity,
        unit: ing.unit,
        scalable: ing.scalable === 1,
        optional: ing.optional === 1,
        measured: conversion.measured,
        inPantry,
        packSize: ing.pack_size,
        packLabel: ing.pack_label,
        costUpdatedAt,
      };
    });

    const nutritionInputs = rawIngredients.map((ing) => {
      const conversion =
        ing.canonical_id != null && ing.base_unit != null
          ? convertToBaseUnit({ baseUnit: ing.base_unit, packSize: ing.pack_size, density: ing.density }, ing.quantity, ing.unit)
          : { value: null, measured: false };
      const manualCost = ing.canonical_id != null ? manualCostByCanonical.get(ing.canonical_id) ?? null : null;
      return {
        quantityBase: conversion.value,
        kcalPer100: ing.kcal_per_100,
        proteinPer100: ing.protein_per_100,
        carbsPer100: ing.carbs_per_100,
        fatPer100: ing.fat_per_100,
        costPer100: effectiveCostPer100(manualCost, ing.cost_per_100),
      };
    });
    const nutrition = deriveNutrition(nutritionInputs, recipe.base_servings);
    const timeSplit = deriveTimeSplit(
      steps.map((s) => ({ effort: s.effort, durationSeconds: s.duration_seconds })),
    );

    let runningOffset = 0;
    const enrichedSteps: EnrichedStep[] = steps.map((s) => {
      const startOffsetSeconds =
        recipe.timeline_mode === 'sequential' ? runningOffset : s.start_offset_seconds;
      if (recipe.timeline_mode === 'sequential') runningOffset += s.duration_seconds ?? 0;
      return {
        id: s.id,
        phase: s.phase,
        instruction: s.instruction,
        durationSeconds: s.duration_seconds,
        startOffsetSeconds,
        effort: s.effort,
        important: s.important === 1,
        laneName: s.lane_id != null ? laneNameById.get(s.lane_id) ?? null : null,
      };
    });

    const hasStaleCost = rawIngredients.some((ing) => {
      if (ing.canonical_id == null) return false;
      const manualCost = manualCostByCanonical.get(ing.canonical_id) ?? null;
      const updatedAt = manualCost != null ? manualFreshAtByCanonical.get(ing.canonical_id) ?? ing.cost_updated_at : ing.cost_updated_at;
      return updatedAt != null && new Date(updatedAt).getTime() < staleCutoff;
    });

    const stats = cookStatsByRecipe.get(recipe.id);
    const exclusionRow = exclusionByRecipe.get(recipe.id) ?? null;
    const exclusion = exclusionRow ? { kind: exclusionRow.kind, expiresAt: exclusionRow.expires_at } : null;

    return {
      id: recipe.id,
      shareId: recipe.share_id,
      name: recipe.name,
      description: recipe.description,
      photoUri: recipe.photo_uri,
      photoEmoji: recipe.photo_emoji,
      visibility: recipe.visibility,
      baseServings: recipe.base_servings,
      timelineMode: recipe.timeline_mode as 'sequential' | 'parallel',
      source: recipe.source,
      seedId: recipe.seed_id,
      originLabel: recipe.origin_label,
      createdAt: recipe.created_at,
      updatedAt: recipe.updated_at,
      tags,
      ingredients: enrichedIngredients,
      steps: enrichedSteps,
      activeSeconds: timeSplit.activeSeconds,
      passiveSeconds: timeSplit.passiveSeconds,
      totalSeconds: timeSplit.totalSeconds,
      durationBucket: durationBucket(timeSplit.totalSeconds),
      kcalPerServing: nutrition.kcalPerServing,
      proteinPerServing: nutrition.proteinPerServing,
      carbsPerServing: nutrition.carbsPerServing,
      fatPerServing: nutrition.fatPerServing,
      costPerServing: nutrition.costPerServing,
      macroCompleteCount: nutrition.macroCompleteCount,
      costCompleteCount: nutrition.costCompleteCount,
      totalIngredientCount: nutrition.totalIngredientCount,
      timesCooked: stats?.times_cooked ?? 0,
      avgRating: stats?.avg_stars ?? null,
      lastCookedAt: stats?.last_cooked_at ?? null,
      isFavourite: favouriteIds.has(recipe.id),
      exclusion,
      hasStaleCost,
      logNotes: logNotesByRecipe.get(recipe.id) ?? [],
    };
  });
}

export function recipePrimaryProtein(recipe: EnrichedRecipe): string | null {
  return primaryProteinTag(recipe.tags);
}
