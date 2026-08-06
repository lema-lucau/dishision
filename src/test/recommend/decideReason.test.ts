import { beforeEach, describe, expect, it } from 'vitest';
import { decidablePool, decideReason } from '../../recommend/decideReason';
import { makeRecipe, resetRecipeFixtureIds } from '../support/recipeFixture';
import type { EnrichedIngredient } from '../../recipes/loadRecipes';

const NOW = new Date('2026-07-30T12:00:00Z').getTime();

function ing(overrides: Partial<EnrichedIngredient> = {}): EnrichedIngredient {
  return {
    id: 1,
    canonicalId: 1,
    canonicalName: 'Thing',
    displayName: 'Thing',
    quantity: 1,
    unit: 'unit',
    scalable: true,
    optional: false,
    measured: true,
    inPantry: true,
    packSize: null,
    packLabel: null,
    costUpdatedAt: null,
    ...overrides,
  };
}

describe('decideReason', () => {
  beforeEach(() => resetRecipeFixtureIds());

  it('mentions a protein gap when that protein has not been cooked in a while', () => {
    const recipe = makeRecipe({ tags: ['fish'], lastCookedAt: '2026-07-01T00:00:00Z', ingredients: [ing()] });
    const reason = decideReason(recipe, [recipe], NOW);
    expect(reason).toMatch(/haven't had fish in \d+ days/);
  });

  it('adds "you have everything" when the pantry is complete', () => {
    const recipe = makeRecipe({ tags: ['fish'], lastCookedAt: null, ingredients: [ing({ inPantry: true })] });
    expect(decideReason(recipe, [recipe], NOW)).toMatch(/you have everything for this/);
  });

  it('never returns an empty reason', () => {
    const recipe = makeRecipe({ tags: [], lastCookedAt: '2026-07-29T00:00:00Z', avgRating: null, costPerServing: null, ingredients: [ing({ inPantry: false })] });
    const reason = decideReason(recipe, [recipe], NOW);
    expect(reason.length).toBeGreaterThan(0);
    expect(reason.endsWith('.')).toBe(true);
  });

  it('starts with a capital letter', () => {
    const recipe = makeRecipe({ tags: ['beef'], lastCookedAt: null, ingredients: [ing()] });
    expect(decideReason(recipe, [recipe], NOW)[0]).toMatch(/[A-Z]/);
  });
});

describe('decidablePool', () => {
  beforeEach(() => resetRecipeFixtureIds());

  it('excludes never-again / not-tonight recipes and stepless ones', () => {
    const ok = makeRecipe({ steps: [{ id: 1, phase: 'cook', instruction: 'x', durationSeconds: 60, startOffsetSeconds: 0, effort: 'active', important: false, laneName: null }] });
    const excluded = makeRecipe({
      exclusion: { kind: 'never_again', expiresAt: null },
      steps: [{ id: 2, phase: 'cook', instruction: 'x', durationSeconds: 60, startOffsetSeconds: 0, effort: 'active', important: false, laneName: null }],
    });
    const stepless = makeRecipe({ steps: [] });
    const pool = decidablePool([ok, excluded, stepless]);
    expect(pool.map((r) => r.id)).toEqual([ok.id]);
  });
});
