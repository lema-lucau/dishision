import { beforeEach, describe, expect, it } from 'vitest';
import { isAllowedByCategories, parseMealCategories, recipeMealCategories } from '../../recommend/mealCategories';
import { makeRecipe, resetRecipeFixtureIds } from '../support/recipeFixture';

describe('recipeMealCategories', () => {
  beforeEach(() => resetRecipeFixtureIds());

  it('picks out only the meal-type tags', () => {
    const recipe = makeRecipe({ tags: ['chicken', 'dinner', 'comfort', 'lunch'] });
    expect(recipeMealCategories(recipe)).toEqual(['dinner', 'lunch']);
  });

  it('is empty for a recipe with no meal-type tags', () => {
    expect(recipeMealCategories(makeRecipe({ tags: ['chicken', 'comfort'] }))).toEqual([]);
  });
});

describe('isAllowedByCategories', () => {
  beforeEach(() => resetRecipeFixtureIds());

  it('passes everything when all four are selected (no restriction)', () => {
    const untagged = makeRecipe({ tags: ['chicken'] });
    expect(isAllowedByCategories(untagged, ['breakfast', 'lunch', 'dinner', 'dessert'])).toBe(true);
  });

  it('passes everything when the selection is empty (treated as no restriction)', () => {
    expect(isAllowedByCategories(makeRecipe({ tags: [] }), [])).toBe(true);
  });

  it('keeps a recipe carrying a selected category', () => {
    expect(isAllowedByCategories(makeRecipe({ tags: ['dinner', 'beef'] }), ['dinner'])).toBe(true);
  });

  it('drops a recipe with none of the selected categories', () => {
    expect(isAllowedByCategories(makeRecipe({ tags: ['breakfast'] }), ['dinner'])).toBe(false);
  });

  it('drops an untagged recipe once the selection narrows', () => {
    expect(isAllowedByCategories(makeRecipe({ tags: ['chicken'] }), ['dinner'])).toBe(false);
  });

  it('matches capitalised tags as stored in the DB (Dinner vs dinner)', () => {
    // The seed runner capitalises tag names, so real recipes carry 'Dinner'.
    expect(isAllowedByCategories(makeRecipe({ tags: ['Dinner', 'Beef'] }), ['dinner'])).toBe(true);
    expect(recipeMealCategories(makeRecipe({ tags: ['Breakfast', 'Chicken'] }))).toEqual(['breakfast']);
  });
});

describe('parseMealCategories', () => {
  it('defaults to all four when unset', () => {
    expect(parseMealCategories(null)).toEqual(['breakfast', 'lunch', 'dinner', 'dessert']);
    expect(parseMealCategories('')).toEqual(['breakfast', 'lunch', 'dinner', 'dessert']);
  });

  it('parses a stored CSV, dropping unknown tokens', () => {
    expect(parseMealCategories('dinner,dessert,nonsense')).toEqual(['dinner', 'dessert']);
  });

  it('falls back to all four if nothing valid parses', () => {
    expect(parseMealCategories('nonsense,junk')).toEqual(['breakfast', 'lunch', 'dinner', 'dessert']);
  });
});
