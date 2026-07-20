// §6.8 median cost cache. computeMedianCostPerServing itself (the actual
// median-over-complete-costs maths) lives in queryEngine.ts and is already
// covered there — this module is purely the setting-table cache in front of
// it: read-through on a cache miss, explicit invalidation on writes that can
// change the answer (recipe/recipe_ingredient/canonical_ingredient.cost_per_100).
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import type { EnrichedRecipe } from '../recipes/loadRecipes';
import { computeMedianCostPerServing } from '../recipes/queryEngine';
import { getSetting } from '../settings/getSetting';
import { setSetting } from '../settings/setSetting';

const MEDIAN_KEY = 'median_cost_per_serving';
const COMPUTED_AT_KEY = 'median_cost_computed_at';
// A cached "no median available" still has to be distinguishable from "no
// cache yet" — getSetting returns null for both, so a real null median is
// stored as this sentinel rather than an empty/absent row.
const NULL_SENTINEL = '__null__';

export async function getMedianCostPerServing(db: DbClient, recipes: EnrichedRecipe[]): Promise<number | null> {
  const cached = await getSetting(db, MEDIAN_KEY);
  if (cached != null) return cached === NULL_SENTINEL ? null : Number(cached);

  const computed = computeMedianCostPerServing(recipes);
  await setSetting(db, MEDIAN_KEY, computed == null ? NULL_SENTINEL : String(computed));
  await setSetting(db, COMPUTED_AT_KEY, new Date().toISOString());
  return computed;
}

// Invalidation sets the cached value to NULL (here: deletes the row) so the
// next read recomputes and re-caches (§6.8). Call after any write to
// recipe, recipe_ingredient, or canonical_ingredient.cost_per_100.
export async function invalidateMedianCostCache(db: DbClient): Promise<void> {
  await db.runAsync(`DELETE FROM setting WHERE key IN ('${MEDIAN_KEY}', '${COMPUTED_AT_KEY}')`);
  logger.info('engine', 'Median cost cache invalidated');
}
