// §5.8 shopping list generation: every recipe_ingredient across the planned
// meals in a date range, scaled to each meal's planned_servings (§3.4),
// converted to base units (§3.2) and consolidated by canonical_id, with
// staples excluded unless running_low and generated lines pack-rounded
// (§3.5). Generating always inserts a brand-new shopping_list row — an
// existing, possibly-edited list is never mutated by a later generation
// (§5.8's "generating again creates a new list" rule).
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { packRoundedQuantity } from '../lib/derive';
import { scaleQuantity } from '../lib/scaling';
import { convertToBaseUnit } from '../lib/units';
import type { BaseUnit, RecipeUnit } from '../seed/types';

export interface GenerateShoppingListInput {
  rangeStart: string; // YYYY-MM-DD
  rangeEnd: string; // YYYY-MM-DD, inclusive
  name?: string | null;
}

export interface GenerateShoppingListResult {
  listId: number;
  itemCount: number;
}

interface MeasuredBucket {
  canonicalId: number;
  displayName: string;
  neededBaseUnits: number;
  baseUnit: BaseUnit;
  packSize: number | null;
}

interface UnmeasuredBucket {
  displayName: string;
  quantity: number;
  unit: RecipeUnit;
}

export async function generateShoppingList(db: DbClient, input: GenerateShoppingListInput): Promise<GenerateShoppingListResult> {
  const rows = await db.getAllAsync<{
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
    `SELECT pm.planned_servings, r.base_servings,
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

  const measured = new Map<number, MeasuredBucket>();
  const unmeasured = new Map<string, UnmeasuredBucket>();

  for (const row of rows) {
    const scaledQty = scaleQuantity(row.quantity, row.scalable === 1, row.base_servings, row.planned_servings);

    if (row.canonical_id != null && row.base_unit != null) {
      const conversion = convertToBaseUnit(
        { baseUnit: row.base_unit, packSize: row.pack_size, density: row.density },
        scaledQty,
        row.unit,
      );
      if (conversion.measured && conversion.value != null) {
        // Staples don't clutter a shopping list unless the household has
        // flagged them running low (§5.8) — always-have items shouldn't
        // reappear on every generated list.
        if (stapleById.has(row.canonical_id) && !stapleById.get(row.canonical_id)) continue;

        const existing = measured.get(row.canonical_id);
        if (existing) {
          existing.neededBaseUnits += conversion.value;
        } else {
          measured.set(row.canonical_id, {
            canonicalId: row.canonical_id,
            displayName: row.canon_name ?? row.display_name,
            neededBaseUnits: conversion.value,
            baseUnit: row.base_unit,
            packSize: row.pack_size,
          });
        }
        continue;
      }
    }

    // Unmeasured (§3.2): no canonical match, or no conversion path. Still
    // shows on the list — consolidated only when name and unit both match,
    // since there's no base unit to sum through otherwise.
    const key = `${row.display_name.toLowerCase()}|${row.unit}`;
    const existingUnmeasured = unmeasured.get(key);
    if (existingUnmeasured) {
      existingUnmeasured.quantity += scaledQty;
    } else {
      unmeasured.set(key, { displayName: row.display_name, quantity: scaledQty, unit: row.unit });
    }
  }

  const listResult = await db.runAsync('INSERT INTO shopping_list (name, range_start, range_end) VALUES (?, ?, ?)', [
    input.name ?? null,
    input.rangeStart,
    input.rangeEnd,
  ]);
  const listId = listResult.lastInsertRowId;

  let sortOrder = 0;
  for (const bucket of measured.values()) {
    const purchaseQty = packRoundedQuantity(bucket.neededBaseUnits, bucket.packSize);
    await db.runAsync(
      `INSERT INTO shopping_list_item (list_id, canonical_id, display_name, quantity, unit, manual, sort_order)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
      [listId, bucket.canonicalId, bucket.displayName, purchaseQty, bucket.baseUnit, sortOrder++],
    );
  }
  for (const bucket of unmeasured.values()) {
    await db.runAsync(
      `INSERT INTO shopping_list_item (list_id, canonical_id, display_name, quantity, unit, manual, sort_order)
       VALUES (?, NULL, ?, ?, ?, 0, ?)`,
      [listId, bucket.displayName, bucket.quantity, bucket.unit, sortOrder++],
    );
  }

  logger.info('pantry', 'Shopping list generated', { listId, itemCount: sortOrder, rangeStart: input.rangeStart, rangeEnd: input.rangeEnd });
  return { listId, itemCount: sortOrder };
}
