import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { getDailyRecommendations } from '../../recommend/dailyCache';
import { createTestDb } from '../support/testDb';
import { makeRecipe, resetRecipeFixtureIds } from '../support/recipeFixture';

const DAY_ONE = new Date('2026-07-19T09:00:00.000Z').getTime();
const SAME_DAY_LATER = new Date('2026-07-19T20:00:00.000Z').getTime();
const NEXT_DAY = new Date('2026-07-20T09:00:00.000Z').getTime();

describe('getDailyRecommendations (§6.1 "cached against the date so picks don\'t shuffle mid-day")', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
    resetRecipeFixtureIds();
  });

  it('returns the same picks for a second call the same day, even though scoring includes random jitter', async () => {
    const recipes = [
      makeRecipe({ tags: ['chicken'], durationBucket: 'under20' }),
      makeRecipe({ tags: ['beef'], durationBucket: '20to40' }),
      makeRecipe({ tags: ['fish'], durationBucket: 'over40' }),
      makeRecipe({ tags: ['pork'], durationBucket: 'under20' }),
    ];
    const first = await getDailyRecommendations(db, recipes, DAY_ONE);
    const second = await getDailyRecommendations(db, recipes, SAME_DAY_LATER);
    expect(second.picks.map((r) => r.id)).toEqual(first.picks.map((r) => r.id));
  });

  it('recomputes (and may reshuffle) on a new day', async () => {
    const recipes = [
      makeRecipe({ tags: ['chicken'], durationBucket: 'under20' }),
      makeRecipe({ tags: ['beef'], durationBucket: '20to40' }),
      makeRecipe({ tags: ['fish'], durationBucket: 'over40' }),
    ];
    await getDailyRecommendations(db, recipes, DAY_ONE);
    const nextDay = await getDailyRecommendations(db, recipes, NEXT_DAY);
    // Same 3-recipe pool either way, but a fresh computation happened —
    // proven by ladderSteps being populated again (the cached-hit path
    // returns an empty ladderSteps array).
    expect(nextDay.ladderSteps.length).toBeGreaterThan(0);
  });

  it('falls back to a fresh computation when a cached pick no longer resolves to a live recipe', async () => {
    const recipeA = makeRecipe({ tags: ['chicken'], durationBucket: 'under20' });
    const recipeB = makeRecipe({ tags: ['beef'], durationBucket: '20to40' });
    const recipeC = makeRecipe({ tags: ['fish'], durationBucket: 'over40' });
    await getDailyRecommendations(db, [recipeA, recipeB, recipeC], DAY_ONE);

    // Simulate recipeA having been deleted since caching.
    const stillAround = [recipeB, recipeC];
    const result = await getDailyRecommendations(db, stillAround, SAME_DAY_LATER);
    expect(result.picks.every((r) => stillAround.some((s) => s.id === r.id))).toBe(true);
  });
});
