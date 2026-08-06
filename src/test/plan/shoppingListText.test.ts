import { describe, expect, it } from 'vitest';
import type { ShoppingListItemRow } from '../../plan/loadShoppingList';
import { parseShoppingListText, shoppingListToText } from '../../plan/shoppingListText';

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

describe('parseShoppingListText', () => {
  it('round-trips a shared list back into items', () => {
    const text = shoppingListToText([
      item({ id: 1, recipeId: 5, recipeName: 'Curry', recipeEmoji: '🍛', displayName: 'Onion', quantity: 2, unit: 'unit' }),
      item({ id: 2, displayName: 'Chicken', quantity: 400, unit: 'g', isCommon: true }),
    ]);
    const result = parseShoppingListText(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toEqual([
      { displayName: 'Onion', quantity: 2, unit: 'unit', buyCount: 1 },
      { displayName: 'Chicken', quantity: 400, unit: 'g', buyCount: 1 },
    ]);
  });

  it('recovers the buy count from ×N', () => {
    const text = shoppingListToText([item({ displayName: 'Milk', quantity: 1, unit: 'unit', buyCount: 3 })]);
    const result = parseShoppingListText(text);
    expect(result.ok && result.items[0].buyCount).toBe(3);
  });

  it('parses a quantityless line as quantity 0', () => {
    const result = parseShoppingListText('🛒 Shopping list\n\nOther\n[ ] Salt — item');
    expect(result.ok && result.items[0]).toMatchObject({ displayName: 'Salt', quantity: 0, unit: 'unit' });
  });

  it('rejects empty input', () => {
    const result = parseShoppingListText('   ');
    expect(result.ok).toBe(false);
  });

  it('rejects text with no recognisable item lines', () => {
    const result = parseShoppingListText('just some random text\nwith no items');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/shopping list/i);
  });
});
