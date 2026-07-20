// §5.8 shopping list generation, sectioned by recipe. Every recipe_ingredient
// across the planned meals in a date range is scaled to that meal's
// planned_servings (§3.4), converted to base units (§3.2), pack-rounded per
// recipe (§3.5), and summed within a single recipe if it appears twice
// there. After that: if two or more DIFFERENT recipes need the exact same
// canonical ingredient at the exact same quantity+unit, those lines merge
// into one "Common" line with a buy_count multiplier ("Chicken breast 400g
// x3") instead of each recipe getting its own identical-looking row.
// Everything else stays under its own recipe's section. Staples are
// excluded unless running_low. Generating always inserts a brand-new
// shopping_list row — an existing, possibly-edited list is never mutated by
// a later generation.
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { packRoundedQuantity } from '../lib/derive';
import { scaleQuantity } from '../lib/scaling';
import { convertToBaseUnit } from '../lib/units';
import type { BaseUnit, RecipeUnit } from '../seed/types';
import { findOrCreateOpenShoppingList } from './shoppingListMutations';

export interface GenerateShoppingListInput {
  rangeStart: string; // YYYY-MM-DD
  rangeEnd: string; // YYYY-MM-DD, inclusive
  name?: string | null;
}

export interface GenerateShoppingListResult {
  listId: number;
  itemCount: number;
}

interface RecipeLine {
  recipeId: number;
  recipeName: string;
  recipeEmoji: string;
  canonicalId: number | null;
  displayName: string;
  quantity: number;
  unit: BaseUnit | RecipeUnit;
}

export async function generateShoppingList(db: DbClient, input: GenerateShoppingListInput): Promise<GenerateShoppingListResult> {
  const rows = await db.getAllAsync<{
    recipe_id: number;
    recipe_name: string;
    recipe_emoji: string;
    planned_servings: number;
    base_servings: number;
    canonical_id: number | null;
    display_name: string;
    quantity: number;
    unit: RecipeUnit;
    scalable: number;
    canon_name: string | null;
    base_unit: BaseUnit | null;
    pack_size: number | null;
    density: number | null;
  }>(
    `SELECT pm.recipe_id, r.name as recipe_name, r.photo_emoji as recipe_emoji,
            pm.planned_servings, r.base_servings,
            ri.canonical_id, ri.display_name, ri.quantity, ri.unit, ri.scalable,
            ci.name as canon_name, ci.base_unit, ci.pack_size, ci.density
     FROM planned_meal pm
     JOIN recipe r ON r.id = pm.recipe_id
     JOIN recipe_ingredient ri ON ri.recipe_id = r.id
     LEFT JOIN canonical_ingredient ci ON ci.id = ri.canonical_id
     WHERE pm.planned_date >= ? AND pm.planned_date <= ?`,
    [input.rangeStart, input.rangeEnd],
  );

  const stapleRows = await db.getAllAsync<{ canonical_id: number; running_low: number }>(
    'SELECT canonical_id, running_low FROM staple',
  );
  const stapleById = new Map(stapleRows.map((r) => [r.canonical_id, r.running_low === 1]));

  // Step 1: consolidate within a single recipe first (a recipe that lists
  // the same ingredient twice shouldn't produce two lines under its own
  // section).
  const perRecipe = new Map<string, RecipeLine>(); // key: recipeId|canonicalId-or-name
  const packSizeByKey = new Map<string, number>();
  for (const row of rows) {
    if (row.canonical_id != null && stapleById.has(row.canonical_id) && !stapleById.get(row.canonical_id)) continue;

    const scaledQty = scaleQuantity(row.quantity, row.scalable === 1, row.base_servings, row.planned_servings);

    let quantity = scaledQty;
    let unit: BaseUnit | RecipeUnit = row.unit;
    let displayName = row.display_name;
    let packSize: number | null = null;

    if (row.canonical_id != null && row.base_unit != null) {
      const conversion = convertToBaseUnit(
        { baseUnit: row.base_unit, packSize: row.pack_size, density: row.density },
        scaledQty,
        row.unit,
      );
      if (conversion.measured && conversion.value != null) {
        quantity = conversion.value;
        unit = row.base_unit;
        displayName = row.canon_name ?? row.display_name;
        packSize = row.pack_size;
      }
    }

    const key = `${row.recipe_id}|${row.canonical_id ?? displayName.toLowerCase()}|${unit}`;
    const existing = perRecipe.get(key);
    if (existing) {
      existing.quantity += quantity;
    } else {
      perRecipe.set(key, {
        recipeId: row.recipe_id,
        recipeName: row.recipe_name,
        recipeEmoji: row.recipe_emoji,
        canonicalId: row.canonical_id,
        displayName,
        quantity,
        unit,
      });
    }
    // Pack rounding is applied once below, after summing within the recipe.
    if (packSize != null) packSizeByKey.set(key, packSize);
  }

  for (const [key, line] of perRecipe) {
    const packSize = packSizeByKey.get(key);
    if (packSize != null) line.quantity = packRoundedQuantity(line.quantity, packSize);
  }

  // Step 2: group across recipes by (ingredient identity, unit, quantity) —
  // an exact match across >=2 distinct recipes becomes a Common line.
  const crossRecipeGroups = new Map<string, RecipeLine[]>();
  for (const line of perRecipe.values()) {
    const groupKey = `${line.canonicalId ?? line.displayName.toLowerCase()}|${line.unit}|${line.quantity}`;
    const list = crossRecipeGroups.get(groupKey) ?? [];
    list.push(line);
    crossRecipeGroups.set(groupKey, list);
  }

  const listResult = await db.runAsync('INSERT INTO shopping_list (name, range_start, range_end) VALUES (?, ?, ?)', [
    input.name ?? null,
    input.rangeStart,
    input.rangeEnd,
  ]);
  const listId = listResult.lastInsertRowId;

  let sortOrder = 0;
  for (const group of crossRecipeGroups.values()) {
    if (group.length >= 2) {
      const [first] = group;
      await db.runAsync(
        `INSERT INTO shopping_list_item
           (list_id, canonical_id, display_name, quantity, unit, manual, is_common, buy_count, sort_order)
         VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?)`,
        [listId, first.canonicalId, first.displayName, first.quantity, first.unit, group.length, sortOrder++],
      );
    } else {
      for (const line of group) {
        await db.runAsync(
          `INSERT INTO shopping_list_item
             (list_id, canonical_id, display_name, quantity, unit, manual, recipe_id, recipe_name, recipe_emoji, sort_order)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
          [listId, line.canonicalId, line.displayName, line.quantity, line.unit, line.recipeId, line.recipeName, line.recipeEmoji, sortOrder++],
        );
      }
    }
  }

  logger.info('pantry', 'Shopping list generated', { listId, itemCount: sortOrder, rangeStart: input.rangeStart, rangeEnd: input.rangeEnd });
  return { listId, itemCount: sortOrder };
}

export interface AddRecipeToShoppingListInput {
  recipeId: number;
  servings: number;
}

export interface AddRecipeToShoppingListResult {
  listId: number;
  itemCount: number;
}

// The recipe detail screen's "Add to shopping list" button — an ad-hoc,
// single-recipe version of generateShoppingList's scaling/unit-conversion/
// staple-exclusion rules, appended to whichever list is currently open
// (findOrCreateOpenShoppingList) instead of starting a brand-new list.
// Pressing the button twice for the same recipe merges into the existing
// unchecked line rather than duplicating it.
export async function addRecipeToShoppingList(
  db: DbClient,
  input: AddRecipeToShoppingListInput,
): Promise<AddRecipeToShoppingListResult> {
  const recipeRow = await db.getFirstAsync<{ id: number; name: string; photo_emoji: string; base_servings: number }>(
    'SELECT id, name, photo_emoji, base_servings FROM recipe WHERE id = ?',
    [input.recipeId],
  );
  if (!recipeRow) throw new Error(`Recipe ${input.recipeId} not found`);

  const rows = await db.getAllAsync<{
    canonical_id: number | null;
    display_name: string;
    quantity: number;
    unit: RecipeUnit;
    scalable: number;
    canon_name: string | null;
    base_unit: BaseUnit | null;
    pack_size: number | null;
    density: number | null;
  }>(
    `SELECT ri.canonical_id, ri.display_name, ri.quantity, ri.unit, ri.scalable,
            ci.name as canon_name, ci.base_unit, ci.pack_size, ci.density
     FROM recipe_ingredient ri
     LEFT JOIN canonical_ingredient ci ON ci.id = ri.canonical_id
     WHERE ri.recipe_id = ?`,
    [input.recipeId],
  );

  const stapleRows = await db.getAllAsync<{ canonical_id: number; running_low: number }>(
    'SELECT canonical_id, running_low FROM staple',
  );
  const stapleById = new Map(stapleRows.map((r) => [r.canonical_id, r.running_low === 1]));

  interface ConsolidatedLine {
    canonicalId: number | null;
    displayName: string;
    quantity: number;
    unit: BaseUnit | RecipeUnit;
  }
  const consolidated = new Map<string, ConsolidatedLine>();
  const packSizeByKey = new Map<string, number>();

  for (const row of rows) {
    if (row.canonical_id != null && stapleById.has(row.canonical_id) && !stapleById.get(row.canonical_id)) continue;

    const scaledQty = scaleQuantity(row.quantity, row.scalable === 1, recipeRow.base_servings, input.servings);

    let quantity = scaledQty;
    let unit: BaseUnit | RecipeUnit = row.unit;
    let displayName = row.display_name;
    let packSize: number | null = null;

    if (row.canonical_id != null && row.base_unit != null) {
      const conversion = convertToBaseUnit(
        { baseUnit: row.base_unit, packSize: row.pack_size, density: row.density },
        scaledQty,
        row.unit,
      );
      if (conversion.measured && conversion.value != null) {
        quantity = conversion.value;
        unit = row.base_unit;
        displayName = row.canon_name ?? row.display_name;
        packSize = row.pack_size;
      }
    }

    const key = `${row.canonical_id ?? displayName.toLowerCase()}|${unit}`;
    const existing = consolidated.get(key);
    if (existing) {
      existing.quantity += quantity;
    } else {
      consolidated.set(key, { canonicalId: row.canonical_id, displayName, quantity, unit });
    }
    if (packSize != null) packSizeByKey.set(key, packSize);
  }

  for (const [key, line] of consolidated) {
    const packSize = packSizeByKey.get(key);
    if (packSize != null) line.quantity = packRoundedQuantity(line.quantity, packSize);
  }

  const listId = await findOrCreateOpenShoppingList(db);
  const maxSortRow = await db.getFirstAsync<{ max_sort: number | null }>(
    'SELECT MAX(sort_order) as max_sort FROM shopping_list_item WHERE list_id = ?',
    [listId],
  );
  let sortOrder = (maxSortRow?.max_sort ?? -1) + 1;

  let itemCount = 0;
  for (const line of consolidated.values()) {
    const existingItem = await db.getFirstAsync<{ id: number; quantity: number }>(
      `SELECT id, quantity FROM shopping_list_item
       WHERE list_id = ? AND recipe_id = ? AND checked = 0 AND unit = ?
         AND ((canonical_id IS NOT NULL AND canonical_id = ?) OR (canonical_id IS NULL AND display_name = ?))`,
      [listId, input.recipeId, line.unit, line.canonicalId, line.displayName],
    );
    if (existingItem) {
      await db.runAsync('UPDATE shopping_list_item SET quantity = ? WHERE id = ?', [
        existingItem.quantity + line.quantity,
        existingItem.id,
      ]);
    } else {
      await db.runAsync(
        `INSERT INTO shopping_list_item
           (list_id, canonical_id, display_name, quantity, unit, manual, recipe_id, recipe_name, recipe_emoji, sort_order)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
        [listId, line.canonicalId, line.displayName, line.quantity, line.unit, input.recipeId, recipeRow.name, recipeRow.photo_emoji, sortOrder++],
      );
    }
    itemCount++;
  }

  logger.info('pantry', 'Recipe added to shopping list', { listId, recipeId: input.recipeId, servings: input.servings, itemCount });
  return { listId, itemCount };
}
