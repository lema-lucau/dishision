import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { getMedianCostPerServing, invalidateMedianCostCache } from '../../recommend/medianCostCache';
import { getSetting } from '../../settings/getSetting';
import { createTestDb } from '../support/testDb';
import { makeRecipe, resetRecipeFixtureIds } from '../support/recipeFixture';

describe('median cost cache (§6.8)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
    resetRecipeFixtureIds();
  });

  it('computes and caches on first read', async () => {
    const recipes = [
      makeRecipe({ costPerServing: 2, costCompleteCount: 1, totalIngredientCount: 1 }),
      makeRecipe({ costPerServing: 4, costCompleteCount: 1, totalIngredientCount: 1 }),
      makeRecipe({ costPerServing: 6, costCompleteCount: 1, totalIngredientCount: 1 }),
    ];
    const median = await getMedianCostPerServing(db, recipes);
    expect(median).toBe(4);
    expect(await getSetting(db, 'median_cost_per_serving')).toBe('4');
    expect(await getSetting(db, 'median_cost_computed_at')).not.toBeNull();
  });

  it('serves the cached value on a second read without recomputing from a changed input', async () => {
    const recipes = [makeRecipe({ costPerServing: 10, costCompleteCount: 1, totalIngredientCount: 1 })];
    await getMedianCostPerServing(db, recipes);
    // A different (empty) recipe list would compute to null if actually re-run —
    // proving the cached value, not a fresh computation, is what's returned.
    const secondRead = await getMedianCostPerServing(db, []);
    expect(secondRead).toBe(10);
  });

  it('caches a genuine "no data" median distinctly from "no cache yet"', async () => {
    const median = await getMedianCostPerServing(db, []);
    expect(median).toBeNull();
    const secondRead = await getMedianCostPerServing(db, [makeRecipe({ costPerServing: 99, costCompleteCount: 1, totalIngredientCount: 1 })]);
    expect(secondRead).toBeNull();
  });

  it('invalidation clears the cache so the next read recomputes', async () => {
    const recipes = [makeRecipe({ costPerServing: 10, costCompleteCount: 1, totalIngredientCount: 1 })];
    await getMedianCostPerServing(db, recipes);
    await invalidateMedianCostCache(db);
    expect(await getSetting(db, 'median_cost_per_serving')).toBeNull();

    const changed = [
      makeRecipe({ costPerServing: 2, costCompleteCount: 1, totalIngredientCount: 1 }),
      makeRecipe({ costPerServing: 8, costCompleteCount: 1, totalIngredientCount: 1 }),
    ];
    const recomputed = await getMedianCostPerServing(db, changed);
    expect(recomputed).toBe(5);
  });
});
