import { describe, expect, it } from 'vitest';
import { effectiveWeights, frequencyNorm, ratingNorm, recencyNorm, scoreRecipe } from '../../recommend/score';
import { DEFAULT_RECOMMENDATION_WEIGHTS } from '../../settings/getSetting';

describe('recencyNorm (§6.1)', () => {
  it('never-cooked defaults to 0.7 (§6.6 cold start)', () => {
    expect(recencyNorm(null)).toBe(0.7);
  });
  it('caps at 1.0 for anything 60+ days out', () => {
    expect(recencyNorm(60)).toBe(1.0);
    expect(recencyNorm(120)).toBe(1.0);
  });
  it('scales linearly below 60 days', () => {
    expect(recencyNorm(30)).toBeCloseTo(0.5);
    expect(recencyNorm(0)).toBe(0);
  });
});

describe('ratingNorm (§6.1)', () => {
  it('unrated defaults to 0.5 (§6.6 cold start)', () => {
    expect(ratingNorm(null)).toBe(0.5);
  });
  it('maps 1..5 stars onto 0..1', () => {
    expect(ratingNorm(1)).toBe(0);
    expect(ratingNorm(5)).toBe(1);
    expect(ratingNorm(3)).toBeCloseTo(0.5);
  });
});

describe('frequencyNorm (§6.1)', () => {
  it('divides by the library max', () => {
    expect(frequencyNorm(3, 6)).toBeCloseTo(0.5);
    expect(frequencyNorm(6, 6)).toBe(1);
  });
  it('is 0 when nothing in the library has ever been cooked', () => {
    expect(frequencyNorm(0, 0)).toBe(0);
  });
});

describe('effectiveWeights (§6.5 degradation)', () => {
  it('leaves weights untouched when >=30% of the library is rated', () => {
    expect(effectiveWeights(DEFAULT_RECOMMENDATION_WEIGHTS, 0.3)).toEqual(DEFAULT_RECOMMENDATION_WEIGHTS);
    expect(effectiveWeights(DEFAULT_RECOMMENDATION_WEIGHTS, 0.9)).toEqual(DEFAULT_RECOMMENDATION_WEIGHTS);
  });

  it('collapses w_rating to 0 and redistributes it proportionally across recency/frequency when ratings are sparse', () => {
    const result = effectiveWeights(DEFAULT_RECOMMENDATION_WEIGHTS, 0.1);
    expect(result.wRating).toBe(0);
    // Jitter is untouched by redistribution.
    expect(result.wJitter).toBe(DEFAULT_RECOMMENDATION_WEIGHTS.wJitter);
    // The whole weight vector still sums to 1 — nothing is lost or gained.
    expect(result.wRecency + result.wRating + result.wFrequency + result.wJitter).toBeCloseTo(1);
    // Redistributed proportionally: recency (0.35) and frequency (0.20) keep
    // their 7:4 ratio after absorbing rating's 0.30.
    expect(result.wRecency / result.wFrequency).toBeCloseTo(0.35 / 0.2);
  });

  it('does not divide by zero when recency and frequency are both weighted 0', () => {
    const weights = { wRecency: 0, wRating: 1, wFrequency: 0, wJitter: 0 };
    const result = effectiveWeights(weights, 0);
    expect(result.wRating).toBe(0);
    expect(Number.isFinite(result.wRecency)).toBe(true);
  });
});

describe('scoreRecipe (§6.1)', () => {
  it('combines every term by its weight, jitter included', () => {
    const weights = { wRecency: 1, wRating: 0, wFrequency: 0, wJitter: 0 };
    expect(scoreRecipe({ daysSinceLastCooked: 60, avgRating: null, timesCooked: 0, maxTimesCooked: 1 }, weights, 0)).toBeCloseTo(1);

    const jitterOnly = { wRecency: 0, wRating: 0, wFrequency: 0, wJitter: 1 };
    expect(scoreRecipe({ daysSinceLastCooked: null, avgRating: null, timesCooked: 0, maxTimesCooked: 1 }, jitterOnly, 0.42)).toBeCloseTo(0.42);
  });
});
