// Plain-text rendering of a shopping list (§5.8), for the Share button. The
// list is the one artefact you'd naturally want to hand to someone standing in
// a shop, and a text blob pastes into any messaging app. Pure and RN-free so
// the formatting is unit-testable — the Share call itself lives in the screen.
import { pluralizeUnit } from '../lib/unitLabels';
import type { DisplayUnit } from '../lib/displayUnit';
import { groupShoppingListItems, type ShoppingListItemRow } from './loadShoppingList';

export interface ShoppingListTextOptions {
  /** Drop already-checked items — what you'd send mid-shop. Default false. */
  uncheckedOnly?: boolean;
}

function line(item: ShoppingListItemRow): string {
  const unit = pluralizeUnit(item.quantity, item.unit as DisplayUnit);
  const qty = item.quantity ? `${item.quantity} ${unit}` : unit;
  const buy = item.buyCount > 1 ? ` ×${item.buyCount}` : '';
  const check = item.checked ? '[x] ' : '[ ] ';
  return `${check}${item.displayName} — ${qty}${buy}`;
}

// Grouped exactly as the screen shows it (recipe sections, then Common, then
// Other), so the shared text reads the same as what's on the phone.
export function shoppingListToText(items: ShoppingListItemRow[], options: ShoppingListTextOptions = {}): string {
  const scoped = options.uncheckedOnly ? items.filter((i) => !i.checked) : items;
  const sections = groupShoppingListItems(scoped);
  const blocks = sections
    .filter((s) => s.items.length > 0)
    .map((s) => {
      const heading = s.emoji ? `${s.emoji} ${s.label}` : s.label;
      return `${heading}\n${s.items.map(line).join('\n')}`;
    });
  return ['🛒 Shopping list', ...blocks].join('\n\n');
}
