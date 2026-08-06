import { describe, expect, it } from 'vitest';
import type { ShoppingListItemRow } from '../../plan/loadShoppingList';
import { shoppingListToText } from '../../plan/shoppingListText';

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

describe('shoppingListToText', () => {
  it('renders a heading, section, and a line per item', () => {
    const text = shoppingListToText([
      item({ id: 1, recipeId: 5, recipeName: 'Curry', recipeEmoji: '🍛', displayName: 'Onion', quantity: 2, unit: 'unit' }),
    ]);
    expect(text).toContain('🛒 Shopping list');
    expect(text).toContain('🍛 Curry');
    expect(text).toContain('[ ] Onion — 2 items');
  });

  it('marks checked items and preserves buy count', () => {
    const text = shoppingListToText([item({ displayName: 'Milk', checked: true, buyCount: 3, isCommon: true })]);
    expect(text).toContain('[x] Milk');
    expect(text).toContain('×3');
  });

  it('can drop checked items for a mid-shop share', () => {
    const text = shoppingListToText(
      [item({ id: 1, displayName: 'Onion' }), item({ id: 2, displayName: 'Garlic', checked: true })],
      { uncheckedOnly: true },
    );
    expect(text).toContain('Onion');
    expect(text).not.toContain('Garlic');
  });

  it('is just the heading when the list is empty', () => {
    expect(shoppingListToText([])).toBe('🛒 Shopping list');
  });
});
