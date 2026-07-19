import { describe, expect, it } from 'vitest';
import { stretchReason } from '../../recommend/stretchReason';
import { makeRecipe } from '../support/recipeFixture';

describe('stretchReason (§5.3 relax-to-boost labelling)', () => {
  it('describes why a backfilled quick-chip miss stretched', () => {
    const recipe = makeRecipe({ totalSeconds: 24 * 60 });
    expect(stretchReason(recipe, ['quick'], null)).toBe('24 min, not under 20');
  });

  it('returns null when the recipe actually satisfies every selected chip', () => {
    const recipe = makeRecipe({ totalSeconds: 10 * 60, tags: ['healthy'] });
    expect(stretchReason(recipe, ['quick', 'healthy'], null)).toBeNull();
  });

  it('reports missing pantry ingredients for "uses what I have"', () => {
    const recipe = makeRecipe({
      ingredients: [
        { id: 1, canonicalId: 1, canonicalName: 'chicken', displayName: 'chicken', quantity: 1, unit: 'unit', scalable: true, optional: false, measured: true, inPantry: false, packSize: null, packLabel: null, costUpdatedAt: null },
      ],
    });
    expect(stretchReason(recipe, ['usesWhatIHave'], null)).toBe('missing 1 ingredient');
  });

  it('flags missing cost data distinctly from a genuinely-above-median cost', () => {
    const noCost = makeRecipe({ costPerServing: null });
    expect(stretchReason(noCost, ['cheap'], 5)).toBe('no cost data');
    const expensive = makeRecipe({ costPerServing: 8 });
    expect(stretchReason(expensive, ['cheap'], 5)).toBe('above the median cost');
  });
});
