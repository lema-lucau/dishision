import { describe, expect, it } from 'vitest';
import {
  deriveNutrition,
  deriveTimeSplit,
  durationBucket,
  packRoundedQuantity,
  type IngredientNutritionInput,
} from '../../lib/derive';

function ing(overrides: Partial<IngredientNutritionInput> = {}): IngredientNutritionInput {
  return {
    quantityBase: 100,
    kcalPer100: 100,
    proteinPer100: 10,
    carbsPer100: 10,
    fatPer100: 10,
    costPer100: 1,
    ...overrides,
  };
}

describe('deriveNutrition (§2.5)', () => {
  it('computes per-serving macros and cost from complete ingredients', () => {
    const result = deriveNutrition([ing(), ing()], 2);
    expect(result.kcalPerServing).toBe(100); // (100+100)/2 servings
    expect(result.costPerServing).toBe(1);
    expect(result.macroCompleteCount).toBe(2);
    expect(result.costCompleteCount).toBe(2);
  });

  it('excludes unmeasured ingredients from macros/cost and counts them in the partial flag', () => {
    const result = deriveNutrition([ing(), ing({ quantityBase: null })], 1);
    expect(result.totalIngredientCount).toBe(2);
    expect(result.macroCompleteCount).toBe(1);
    expect(result.kcalPerServing).toBe(100);
  });

  it('degrades honestly to null rather than zero when nothing is complete', () => {
    const result = deriveNutrition([ing({ quantityBase: null }), ing({ costPer100: null, quantityBase: null })], 1);
    expect(result.kcalPerServing).toBeNull();
    expect(result.costPerServing).toBeNull();
  });

  it('handles the zero-ingredient edge case', () => {
    const result = deriveNutrition([], 2);
    expect(result.kcalPerServing).toBeNull();
    expect(result.costPerServing).toBeNull();
    expect(result.totalIngredientCount).toBe(0);
  });

  it('partial data: 9 of 11 ingredients contribute to macros', () => {
    const complete = Array.from({ length: 9 }, () => ing());
    const incomplete = Array.from({ length: 2 }, () => ing({ kcalPer100: null }));
    const result = deriveNutrition([...complete, ...incomplete], 1);
    expect(result.macroCompleteCount).toBe(9);
    expect(result.totalIngredientCount).toBe(11);
  });
});

describe('deriveTimeSplit', () => {
  it('sums duration_seconds grouped by effort', () => {
    const result = deriveTimeSplit([
      { effort: 'active', durationSeconds: 300 },
      { effort: 'passive', durationSeconds: 600 },
      { effort: 'active', durationSeconds: null },
    ]);
    expect(result.activeSeconds).toBe(300);
    expect(result.passiveSeconds).toBe(600);
    expect(result.totalSeconds).toBe(900);
  });
});

describe('durationBucket (§6.4)', () => {
  it('buckets at exactly 20 and 40 minutes', () => {
    expect(durationBucket(19 * 60)).toBe('under20');
    expect(durationBucket(20 * 60)).toBe('20to40');
    expect(durationBucket(40 * 60)).toBe('20to40');
    expect(durationBucket(41 * 60)).toBe('over40');
  });
});

describe('packRoundedQuantity (§3.5)', () => {
  it('rounds up to whole packs', () => {
    expect(packRoundedQuantity(140, 200)).toBe(200);
    expect(packRoundedQuantity(250, 200)).toBe(400);
  });

  it('passes through unchanged when there is no pack_size', () => {
    expect(packRoundedQuantity(140, null)).toBe(140);
    expect(packRoundedQuantity(140, undefined)).toBe(140);
  });
});
