// §5.8 shopping list read. "The" shopping list is whichever is most recent —
// the same list completeCook.ts's findOrCreateOpenShoppingList auto-adds
// shortfalls to, so what the Shopping screen shows and what a cook shortfall
// lands in are always the same list.
import type { DbClient } from '../db/DbClient';
import type { BaseUnit, RecipeUnit } from '../seed/types';

export interface ShoppingListItemRow {
  id: number;
  canonicalId: number | null;
  displayName: string;
  quantity: number;
  unit: RecipeUnit | BaseUnit;
  checked: boolean;
  checkedAt: string | null;
  manual: boolean;
  sortOrder: number;
  recipeId: number | null;
  recipeName: string | null;
  recipeEmoji: string | null;
  isCommon: boolean;
  buyCount: number;
}

export interface ShoppingListSummary {
  id: number;
  name: string | null;
  rangeStart: string | null;
  rangeEnd: string | null;
  createdAt: string;
  completedAt: string | null;
  items: ShoppingListItemRow[];
}

// A section is either one recipe's own ingredients, the cross-recipe
// "Common" bucket, or "Other" for manual additions with no recipe of their
// own — see shoppingListGeneration.ts for how a line lands in one or the
// other.
export interface ShoppingListSection {
  key: string;
  label: string;
  emoji: string | null;
  items: ShoppingListItemRow[];
}

function mapItem(r: {
  id: number;
  canonical_id: number | null;
  display_name: string;
  quantity: number;
  unit: string;
  checked: number;
  checked_at: string | null;
  manual: number;
  sort_order: number;
  recipe_id: number | null;
  recipe_name: string | null;
  recipe_emoji: string | null;
  is_common: number;
  buy_count: number;
}): ShoppingListItemRow {
  return {
    id: r.id,
    canonicalId: r.canonical_id,
    displayName: r.display_name,
    quantity: r.quantity,
    unit: r.unit as RecipeUnit | BaseUnit,
    checked: r.checked === 1,
    checkedAt: r.checked_at,
    manual: r.manual === 1,
    sortOrder: r.sort_order,
    recipeId: r.recipe_id,
    recipeName: r.recipe_name,
    recipeEmoji: r.recipe_emoji,
    isCommon: r.is_common === 1,
    buyCount: r.buy_count,
  };
}

async function loadItems(db: DbClient, listId: number): Promise<ShoppingListItemRow[]> {
  const rows = await db.getAllAsync<{
    id: number;
    canonical_id: number | null;
    display_name: string;
    quantity: number;
    unit: string;
    checked: number;
    checked_at: string | null;
    manual: number;
    sort_order: number;
    recipe_id: number | null;
    recipe_name: string | null;
    recipe_emoji: string | null;
    is_common: number;
    buy_count: number;
  }>(
    `SELECT id, canonical_id, display_name, quantity, unit, checked, checked_at, manual, sort_order,
            recipe_id, recipe_name, recipe_emoji, is_common, buy_count
     FROM shopping_list_item WHERE list_id = ? ORDER BY sort_order`,
    [listId],
  );
  return rows.map(mapItem);
}

// Recipe sections (alphabetical), then Common, then Other (manual/unlinked)
// last. Items keep their sort_order-derived order within each section.
export function groupShoppingListItems(items: ShoppingListItemRow[]): ShoppingListSection[] {
  const sections = new Map<string, ShoppingListSection>();
  for (const item of items) {
    const key = item.manual && item.recipeId == null ? 'manual' : item.isCommon ? 'common' : `recipe:${item.recipeId}`;
    let section = sections.get(key);
    if (!section) {
      section = {
        key,
        label: key === 'manual' ? 'Other' : key === 'common' ? 'Common to all recipes' : (item.recipeName ?? 'Recipe'),
        emoji: key === 'recipe:' + item.recipeId ? item.recipeEmoji : null,
        items: [],
      };
      sections.set(key, section);
    }
    section.items.push(item);
  }
  const all = Array.from(sections.values());
  const recipeSections = all.filter((s) => s.key.startsWith('recipe:')).sort((a, b) => a.label.localeCompare(b.label));
  const common = all.filter((s) => s.key === 'common');
  const manual = all.filter((s) => s.key === 'manual');
  return [...recipeSections, ...common, ...manual];
}

// Latest list by created_at, regardless of completed_at — matches
// findOrCreateOpenShoppingList's "most recent" semantics in completeCook.ts.
export async function loadLatestShoppingList(db: DbClient): Promise<ShoppingListSummary | null> {
  const list = await db.getFirstAsync<{
    id: number;
    name: string | null;
    range_start: string | null;
    range_end: string | null;
    created_at: string;
    completed_at: string | null;
  }>('SELECT id, name, range_start, range_end, created_at, completed_at FROM shopping_list ORDER BY created_at DESC LIMIT 1');
  if (!list) return null;
  return {
    id: list.id,
    name: list.name,
    rangeStart: list.range_start,
    rangeEnd: list.range_end,
    createdAt: list.created_at,
    completedAt: list.completed_at,
    items: await loadItems(db, list.id),
  };
}

export async function loadShoppingList(db: DbClient, listId: number): Promise<ShoppingListSummary | null> {
  const list = await db.getFirstAsync<{
    id: number;
    name: string | null;
    range_start: string | null;
    range_end: string | null;
    created_at: string;
    completed_at: string | null;
  }>('SELECT id, name, range_start, range_end, created_at, completed_at FROM shopping_list WHERE id = ?', [listId]);
  if (!list) return null;
  return {
    id: list.id,
    name: list.name,
    rangeStart: list.range_start,
    rangeEnd: list.range_end,
    createdAt: list.created_at,
    completedAt: list.completed_at,
    items: await loadItems(db, list.id),
  };
}
