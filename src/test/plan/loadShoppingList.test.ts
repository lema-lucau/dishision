import { describe, expect, it } from 'vitest';
import { groupShoppingListItems, type ShoppingListItemRow } from '../../plan/loadShoppingList';

function item(overrides: Partial<ShoppingListItemRow> = {}): ShoppingListItemRow {
  return {
    id: overrides.id ?? Math.random(),
    canonicalId: 1,
    displayName: 'Onion',
    quantity: 100,
    unit: 'g',
    checked: false,
    checkedAt: null,
    manual: false,
    sortOrder: 0,
    recipeId: null,
    recipeName: null,
    recipeEmoji: null,
    isCommon: false,
    buyCount: 1,
    ...overrides,
  };
}

describe('groupShoppingListItems', () => {
  it('groups per-recipe lines under their own recipe section', () => {
    const items = [
      item({ id: 1, recipeId: 5, recipeName: 'Curry', recipeEmoji: '🍛', displayName: 'Onion' }),
      item({ id: 2, recipeId: 5, recipeName: 'Curry', recipeEmoji: '🍛', displayName: 'Garlic' }),
    ];
    const sections = groupShoppingListItems(items);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ key: 'recipe:5', label: 'Curry', emoji: '🍛' });
    expect(sections[0].items.map((i) => i.id)).toEqual([1, 2]);
  });

  it('puts is_common lines under a Common section with no emoji', () => {
    const items = [item({ id: 1, isCommon: true, buyCount: 3, recipeId: null })];
    const sections = groupShoppingListItems(items);
    expect(sections[0]).toMatchObject({ key: 'common', label: 'Common to all recipes', emoji: null });
  });

  it('puts unlinked manual items under Other', () => {
    const items = [item({ id: 1, manual: true, recipeId: null, isCommon: false })];
    const sections = groupShoppingListItems(items);
    expect(sections[0]).toMatchObject({ key: 'manual', label: 'Other' });
  });

  it('orders recipe sections alphabetically, then Common, then Other', () => {
    const items = [
      item({ id: 1, manual: true, recipeId: null }),
      item({ id: 2, isCommon: true, recipeId: null }),
      item({ id: 3, recipeId: 2, recipeName: 'Zebra Stew' }),
      item({ id: 4, recipeId: 1, recipeName: 'Apple Crumble' }),
    ];
    const sections = groupShoppingListItems(items);
    expect(sections.map((s) => s.key)).toEqual(['recipe:1', 'recipe:2', 'common', 'manual']);
  });
});
