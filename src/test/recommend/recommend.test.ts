import { describe, expect, it } from 'vitest';
import { computeRecommendations } from '../../recommend/recommend';
import { DEFAULT_RECOMMENDATION_WEIGHTS } from '../../settings/getSetting';
import { makeRecipe, resetRecipeFixtureIds } from '../support/recipeFixture';

const NOW = new Date('2026-07-19T18:00:00.000Z').getTime();
const deterministicRandom = () => 0.5;

describe('computeRecommendations (§6.1-§6.4 orchestration)', () => {
  it('with only 5 recipes and the default 5-day window, the ladder steps 5 → 3 → 2 → off and records each step', () => {
    resetRecipeFixtureIds();
    // 5 recipes: 4 were cooked within the last 2 days (inside every rung
    // except "off"), 1 was never cooked. Only the recency filter at "off"
    // lets enough of them through.
    const recipes = [
      makeRecipe({ lastCookedAt: new Date(NOW - 1 * 86400000).toISOString(), tags: ['chicken'], durationBucket: 'under20' }),
      makeRecipe({ lastCookedAt: new Date(NOW - 1 * 86400000).toISOString(), tags: ['beef'], durationBucket: '20to40' }),
      makeRecipe({ lastCookedAt: new Date(NOW - 1 * 86400000).toISOString(), tags: ['fish'], durationBucket: 'over40' }),
      makeRecipe({ lastCookedAt: new Date(NOW - 1 * 86400000).toISOString(), tags: ['pork'], durationBucket: 'under20' }),
      makeRecipe({ lastCookedAt: null, tags: ['veg'], durationBucket: '20to40' }),
    ];

    const result = computeRecommendations(recipes, {
      now: NOW,
      recencyWindowDays: 5,
      yesterdaysPrimaryProtein: null,
      weights: DEFAULT_RECOMMENDATION_WEIGHTS,
      random: deterministicRandom,
    });

    expect(result.ladderSteps.map((s) => s.windowDays)).toEqual([5, 3, 2, 0]);
    expect(result.usedWindowDays).toBe(0);
    expect(result.relaxed).toBe(true);
    expect(result.relaxationLabel).not.toBeNull();
    expect(result.picks.length).toBeGreaterThanOrEqual(3);
  });

  it('does not relax when the starting window already yields >= 3 survivors', () => {
    resetRecipeFixtureIds();
    const recipes = [
      makeRecipe({ lastCookedAt: null, tags: ['chicken'], durationBucket: 'under20' }),
      makeRecipe({ lastCookedAt: null, tags: ['beef'], durationBucket: '20to40' }),
      makeRecipe({ lastCookedAt: null, tags: ['fish'], durationBucket: 'over40' }),
    ];
    const result = computeRecommendations(recipes, {
      now: NOW,
      recencyWindowDays: 5,
      yesterdaysPrimaryProtein: null,
      weights: DEFAULT_RECOMMENDATION_WEIGHTS,
      random: deterministicRandom,
    });
    expect(result.relaxed).toBe(false);
    expect(result.ladderSteps).toHaveLength(1);
    expect(result.usedWindowDays).toBe(5);
  });

  it('still returns whatever survives even when "off" yields fewer than 3', () => {
    resetRecipeFixtureIds();
    const onlyOne = [makeRecipe({ exclusion: { kind: 'never_again', expiresAt: null } }), makeRecipe({ tags: ['chicken'] })];
    const result = computeRecommendations(onlyOne, {
      now: NOW,
      recencyWindowDays: 5,
      yesterdaysPrimaryProtein: null,
      weights: DEFAULT_RECOMMENDATION_WEIGHTS,
      random: deterministicRandom,
    });
    expect(result.picks).toHaveLength(1);
  });

  it('excludes yesterday\'s primary protein from the eligible pool', () => {
    resetRecipeFixtureIds();
    const chicken = makeRecipe({ tags: ['chicken'], durationBucket: 'under20' });
    const beef = makeRecipe({ tags: ['beef'], durationBucket: '20to40' });
    const fish = makeRecipe({ tags: ['fish'], durationBucket: 'over40' });
    const result = computeRecommendations([chicken, beef, fish], {
      now: NOW,
      recencyWindowDays: 0,
      yesterdaysPrimaryProtein: 'chicken',
      weights: DEFAULT_RECOMMENDATION_WEIGHTS,
      random: deterministicRandom,
    });
    expect(result.picks.map((r) => r.id)).not.toContain(chicken.id);
  });
});
