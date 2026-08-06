// Plain-text rendering of a shopping list (§5.8), for the Share button — and
// its inverse, the parser behind Import. The list is the one artefact you'd
// naturally hand to someone standing in a shop, and a text blob pastes into any
// messaging app. Pure and RN-free so both directions are unit-testable — the
// Share/clipboard I/O lives in the screen.
import { DISPLAY_UNIT_LABELS, pluralizeUnit } from '../lib/unitLabels';
import type { DisplayUnit } from '../lib/displayUnit';
import type { BaseUnit, RecipeUnit } from '../seed/types';
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

// ── Import ───────────────────────────────────────────────────────────────────

export interface ParsedShoppingItem {
  displayName: string;
  quantity: number;
  unit: RecipeUnit | BaseUnit;
  buyCount: number;
}

export type ParseShoppingListResult =
  | { ok: true; items: ParsedShoppingItem[] }
  | { ok: false; error: string };

// Inverse of UNIT_LABELS: maps every label we render (singular and plural) back
// to a storable unit. 'item'/'items' → the schema's internal 'unit'. 'pack'
// isn't a storable unit (it's a display artefact of pack-rounding), so it maps
// to 'unit' — the imported line becomes a plain manual item the user can edit.
const LABEL_TO_UNIT: Record<string, RecipeUnit | BaseUnit> = (() => {
  const map: Record<string, RecipeUnit | BaseUnit> = {};
  for (const [unit, label] of Object.entries(DISPLAY_UNIT_LABELS)) {
    const storable: RecipeUnit | BaseUnit = unit === 'pack' ? 'unit' : (unit as RecipeUnit);
    map[label] = storable;
    map[`${label}s`] = storable; // plural form ("items", "cups", "packs")
  }
  return map;
})();

// One item line: "[ ] Onion — 2 items", "[x] Milk — 1 pack ×3", "[ ] Salt — item".
// The em dash and checkbox are exactly what shoppingListToText emits.
const ITEM_LINE = /^\[[ xX]\]\s+(.+?)\s+—\s+(.+?)\s*$/;

function parseQuantityPart(part: string): { quantity: number; unit: RecipeUnit | BaseUnit; buyCount: number } {
  let rest = part.trim();
  let buyCount = 1;
  const buyMatch = rest.match(/×\s*(\d+)\s*$/);
  if (buyMatch) {
    buyCount = Math.max(1, parseInt(buyMatch[1], 10));
    rest = rest.slice(0, buyMatch.index).trim();
  }
  // Leading number (optional) then a unit label. "2 items" | "500g" | "items".
  const qtyMatch = rest.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  const quantity = qtyMatch ? Number(qtyMatch[1]) : 0;
  const unitLabel = (qtyMatch ? qtyMatch[2] : rest).trim();
  const unit = LABEL_TO_UNIT[unitLabel] ?? 'unit';
  return { quantity, unit, buyCount };
}

// Parses text produced by shoppingListToText (or hand-typed in the same shape).
// Lenient about section headings and surrounding chatter — anything that isn't
// a recognisable item line is skipped — but if nothing parses it rejects with a
// message, so a paste of the wrong thing fails loudly rather than adding
// nothing silently.
export function parseShoppingListText(text: string): ParseShoppingListResult {
  if (text.trim() === '') return { ok: false, error: "There's nothing to import — paste a shopping list first." };

  const items: ParsedShoppingItem[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const match = raw.match(ITEM_LINE);
    if (!match) continue;
    const displayName = match[1].trim();
    if (displayName === '') continue;
    items.push({ displayName, ...parseQuantityPart(match[2]) });
  }

  if (items.length === 0) {
    return {
      ok: false,
      error:
        "That doesn't look like a shopping list. Each item should be on its own line like “[ ] Onion — 2 items”. Try copying it again from the Share button.",
    };
  }
  return { ok: true, items };
}
