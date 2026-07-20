import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { dismissAndPromote, getDailyRecommendations } from '../../recommend/dailyCache';
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

describe('dismissAndPromote (§6.7 — promote the bench, don\'t reshuffle)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
    resetRecipeFixtureIds();
  });

  function diversePool(count: number) {
    const proteins = ['chicken', 'beef', 'fish', 'pork', 'lamb', 'veg'];
    const buckets: Array<'under20' | '20to40' | 'over40'> = ['under20', '20to40', 'over40'];
    return Array.from({ length: count }, (_, i) =>
      makeRecipe({ tags: [proteins[i % proteins.length]], durationBucket: buckets[i % buckets.length] }),
    );
  }

  it('promotes #2/#3 up and pulls a new #3 from the cached bench, without touching the other picks\' order', async () => {
    const recipes = diversePool(10);
    const first = await getDailyRecommendations(db, recipes, DAY_ONE);
    expect(first.picks.length).toBeGreaterThanOrEqual(4);

    const dismissed = first.picks[0];
    const promoted = await dismissAndPromote(db, dismissed.id, recipes, SAME_DAY_LATER);

    // The dismissed dish is gone, and the rest of the original bench order
    // is preserved — nothing was recomputed/reshuffled.
    expect(promoted.picks.map((r) => r.id)).toEqual(first.picks.slice(1).map((r) => r.id));
    expect(promoted.picks[0].id).toBe(first.picks[1].id);
  });

  it('a second read after promotion sees the promoted (shortened) bench, not the original', async () => {
    const recipes = diversePool(10);
    const first = await getDailyRecommendations(db, recipes, DAY_ONE);
    await dismissAndPromote(db, first.picks[0].id, recipes, SAME_DAY_LATER);

    const reread = await getDailyRecommendations(db, recipes, SAME_DAY_LATER);
    expect(reread.picks.map((r) => r.id)).not.toContain(first.picks[0].id);
  });

  it('falls back to a fresh compute (finding fresh alternates) when the cached bench alone can\'t cover the dismissal', async () => {
    // Library starts small enough that the cached bench is short...
    const smallPool = diversePool(3);
    const first = await getDailyRecommendations(db, smallPool, DAY_ONE);
    expect(first.picks).toHaveLength(3);

    // ...then grows before the dismissal — a promotion-only path would be
    // stuck with just 2 leftovers from the original short bench, but a
    // fresh compute can find more from the now-larger library. The real
    // caller (Home) writes the recipe_exclusion row before calling
    // dismissAndPromote; simulate that here so a fresh compute still
    // excludes the dismissed dish via the hard filter (§6.2).
    const dismissedId = first.picks[0].id;
    const grownPool = [...smallPool, ...diversePool(7)].map((r) =>
      r.id === dismissedId ? { ...r, exclusion: { kind: 'not_tonight' as const, expiresAt: new Date(SAME_DAY_LATER + 86400000).toISOString() } } : r,
    );
    const promoted = await dismissAndPromote(db, dismissedId, grownPool, SAME_DAY_LATER);
    expect(promoted.picks.length).toBeGreaterThan(2);
    expect(promoted.picks.map((r) => r.id)).not.toContain(dismissedId);
  });
});
