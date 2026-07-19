import { describe, expect, it } from 'vitest';
import { computeChipAvailability, computeMedianCostPerServing, runRecipeQuery } from '../../recipes/queryEngine';
import type { EnrichedRecipe } from '../../recipes/loadRecipes';

let nextId = 1;

function recipe(overrides: Partial<EnrichedRecipe> = {}): EnrichedRecipe {
  const id = nextId++;
  return {
    id,
    shareId: `share-${id}`,
    name: `Recipe ${id}`,
    description: null,
    photoUri: null,
    photoEmoji: '🍛',
    visibility: 'private',
    baseServings: 2,
    timelineMode: 'sequential',
    source: 'manual',
    seedId: null,
    originLabel: null,
    createdAt: new Date(2026, 0, id).toISOString(),
    updatedAt: new Date(2026, 0, id).toISOString(),
    tags: [],
    ingredients: [],
    steps: [],
    activeSeconds: 600,
    passiveSeconds: 0,
    totalSeconds: 600,
    durationBucket: 'under20',
    kcalPerServing: 400,
    proteinPerServing: 20,
    carbsPerServing: 40,
    fatPerServing: 10,
    costPerServing: 2,
    macroCompleteCount: 1,
    costCompleteCount: 1,
    totalIngredientCount: 1,
    timesCooked: 0,
    avgRating: null,
    lastCookedAt: null,
    isFavourite: false,
    exclusion: null,
    hasStaleCost: false,
    logNotes: [],
    ...overrides,
  };
}

// §5.3's relax rule backfills to 3 whenever fewer than 3 recipes survive
// hard filtering — so predicate tests need >=3 genuine matches to observe
// the predicate in isolation rather than the backfill.
describe('chip predicates (§5.3)', () => {
  it('quick chip: total_time < 20 min', () => {
    const quick = Array.from({ length: 3 }, () => recipe({ totalSeconds: 19 * 60 }));
    const slow = recipe({ totalSeconds: 21 * 60 });
    const result = runRecipeQuery([...quick, slow], { chips: ['quick'], sort: 'name' });
    expect(new Set(result.items.map((i) => i.recipe.id))).toEqual(new Set(quick.map((r) => r.id)));
    expect(result.relaxed).toBe(false);
  });

  it('highProtein chip: protein_per_serving >= 30g', () => {
    const high = Array.from({ length: 3 }, () => recipe({ proteinPerServing: 30 }));
    const low = recipe({ proteinPerServing: 29 });
    const result = runRecipeQuery([...high, low], { chips: ['highProtein'], sort: 'name' });
    expect(new Set(result.items.map((i) => i.recipe.id))).toEqual(new Set(high.map((r) => r.id)));
  });

  it('protein tag chips match the recipe tag', () => {
    const chicken = Array.from({ length: 3 }, () => recipe({ tags: ['chicken'] }));
    const beef = recipe({ tags: ['beef'] });
    const result = runRecipeQuery([...chicken, beef], { chips: ['chicken'], sort: 'name' });
    expect(new Set(result.items.map((i) => i.recipe.id))).toEqual(new Set(chicken.map((r) => r.id)));
  });

  it('uses what I have: optional ingredients never block, staples are exempt', () => {
    const satisfiedIngredients: EnrichedRecipe['ingredients'] = [
      { id: 1, canonicalId: 1, canonicalName: 'salt', displayName: 'salt', quantity: 1, unit: 'tsp', scalable: true, optional: false, measured: true, inPantry: true, packSize: null, packLabel: null, costUpdatedAt: null },
      { id: 2, canonicalId: 2, canonicalName: 'saffron', displayName: 'saffron', quantity: 1, unit: 'g', scalable: true, optional: true, measured: true, inPantry: false, packSize: null, packLabel: null, costUpdatedAt: null },
    ];
    const satisfied = Array.from({ length: 3 }, () => recipe({ ingredients: satisfiedIngredients }));
    const unsatisfied = recipe({
      ingredients: [
        { id: 3, canonicalId: 3, canonicalName: 'chicken', displayName: 'chicken', quantity: 400, unit: 'g', scalable: true, optional: false, measured: true, inPantry: false, packSize: null, packLabel: null, costUpdatedAt: null },
      ],
    });
    const result = runRecipeQuery([...satisfied, unsatisfied], { chips: ['usesWhatIHave'], sort: 'name' });
    expect(new Set(result.items.map((i) => i.recipe.id))).toEqual(new Set(satisfied.map((r) => r.id)));
  });

  it('cheap chip: below the median of complete-cost recipes; median excludes partial-cost recipes', () => {
    const cheap = Array.from({ length: 3 }, () => recipe({ costPerServing: 1, costCompleteCount: 1, totalIngredientCount: 1 }));
    const pricey = Array.from({ length: 3 }, () => recipe({ costPerServing: 10, costCompleteCount: 1, totalIngredientCount: 1 }));
    // Incomplete cost data — excluded from the median calc (§6.8), even though it still has a computed (partial) per-serving figure.
    const partial = recipe({ costPerServing: 0.5, costCompleteCount: 1, totalIngredientCount: 2 });

    const median = computeMedianCostPerServing([...cheap, ...pricey, partial]);
    expect(median).toBe(5.5); // median of [1,1,1,10,10,10] — partial's 0.5 never enters this calc

    const result = runRecipeQuery([...cheap, ...pricey, partial], { chips: ['cheap'], sort: 'name' });
    const matchedIds = new Set(result.items.map((i) => i.recipe.id));
    for (const r of cheap) expect(matchedIds.has(r.id)).toBe(true);
    for (const r of pricey) expect(matchedIds.has(r.id)).toBe(false);
  });
});

describe('chip availability threshold (§5.3)', () => {
  it('greys a chip when under 60% of recipes have the required data', () => {
    const withCost = recipe({ costPerServing: 1 });
    const withoutCost = Array.from({ length: 9 }, () => recipe({ costPerServing: null }));
    const availability = computeChipAvailability([withCost, ...withoutCost]);
    expect(availability.cheap.enabled).toBe(false);
    expect(availability.cheap.reason).toMatch(/Add costs/);
  });

  it('enables the chip once coverage reaches 60%', () => {
    const withCost = Array.from({ length: 6 }, () => recipe({ costPerServing: 1 }));
    const withoutCost = Array.from({ length: 4 }, () => recipe({ costPerServing: null }));
    const availability = computeChipAvailability([...withCost, ...withoutCost]);
    expect(availability.cheap.enabled).toBe(true);
  });
});

describe('relaxation backfill (§5.3) — picker only, relax: true', () => {
  it('backfills to 3 and marks the result relaxed when fewer than 3 match', () => {
    const matching = recipe({ tags: ['chicken'] });
    const others = Array.from({ length: 5 }, () => recipe({ tags: ['beef'] }));
    const result = runRecipeQuery([matching, ...others], { chips: ['chicken'], sort: 'name', relax: true });
    expect(result.relaxed).toBe(true);
    expect(result.items.length).toBe(3);
    expect(result.items[0].recipe.id).toBe(matching.id);
  });

  it('does not relax when 3 or more already match', () => {
    const matches = Array.from({ length: 4 }, () => recipe({ tags: ['chicken'] }));
    const result = runRecipeQuery(matches, { chips: ['chicken'], sort: 'name', relax: true });
    expect(result.relaxed).toBe(false);
    expect(result.items.length).toBe(4);
  });
});

describe('Recipes tab hard filter (§5.4) — no relax by default', () => {
  it('shows every match, however few, without backfilling', () => {
    const matching = recipe({ tags: ['chicken'] });
    const others = Array.from({ length: 5 }, () => recipe({ tags: ['beef'] }));
    const result = runRecipeQuery([matching, ...others], { chips: ['chicken'], sort: 'name' });
    expect(result.relaxed).toBe(false);
    expect(result.items.map((i) => i.recipe.id)).toEqual([matching.id]);
  });

  it('shows zero results rather than padding when nothing matches', () => {
    const others = Array.from({ length: 5 }, () => recipe({ tags: ['beef'] }));
    const result = runRecipeQuery(others, { chips: ['chicken'], sort: 'name' });
    expect(result.items).toHaveLength(0);
  });
});

describe('exclusions (§6.2)', () => {
  it('excludes never_again always', () => {
    const excluded = recipe({ exclusion: { kind: 'never_again', expiresAt: null } });
    const kept = recipe();
    const result = runRecipeQuery([excluded, kept], { chips: [], sort: 'name' });
    expect(result.items.map((i) => i.recipe.id)).toEqual([kept.id]);
  });

  it('excludes not_tonight only while unexpired', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();
    const stillExcluded = recipe({ exclusion: { kind: 'not_tonight', expiresAt: future } });
    const expired = recipe({ exclusion: { kind: 'not_tonight', expiresAt: past } });
    const result = runRecipeQuery([stillExcluded, expired], { chips: [], sort: 'name' });
    expect(result.items.map((i) => i.recipe.id)).toEqual([expired.id]);
  });
});

describe('search (§5.4)', () => {
  it('matches name, description, and ingredient display names', () => {
    const byName = recipe({ name: 'Thai Green Curry' });
    const byDescription = recipe({ description: 'a coconutty weeknight staple' });
    const result = runRecipeQuery([byName, byDescription], { chips: [], sort: 'name', search: 'coconutty' });
    expect(result.items.map((i) => i.recipe.id)).toEqual([byDescription.id]);
  });

  it('labels a note-only match distinctly, with the matching snippet', () => {
    const noteMatch = recipe({ logNotes: ['too salty this time'] });
    const result = runRecipeQuery([noteMatch], { chips: [], sort: 'name', search: 'too salty' });
    expect(result.items[0].matchedNote).toBe('too salty this time');
  });

  it('a name/description/ingredient match carries no note snippet', () => {
    const byName = recipe({ name: 'Thai Green Curry' });
    const result = runRecipeQuery([byName], { chips: [], sort: 'name', search: 'thai' });
    expect(result.items[0].matchedNote).toBeNull();
  });
});

describe('sort (§5.4)', () => {
  it('sorts nulls last regardless of direction', () => {
    const rated = recipe({ avgRating: 4 });
    const unrated = recipe({ avgRating: null });
    const asc = runRecipeQuery([unrated, rated], { chips: [], sort: 'rating', direction: 'asc' });
    expect(asc.items.map((i) => i.recipe.id)).toEqual([rated.id, unrated.id]);
    const desc = runRecipeQuery([unrated, rated], { chips: [], sort: 'rating', direction: 'desc' });
    expect(desc.items.map((i) => i.recipe.id)).toEqual([rated.id, unrated.id]);
  });
});
