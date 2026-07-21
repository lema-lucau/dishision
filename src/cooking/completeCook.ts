// §5.7 Cook Complete orchestration — the single place a cook actually lands:
// writes the cook_log row, deducts pantry per the real-shortfall rule,
// auto-adds real shortfalls to an open shopping list (gated by the
// auto_add_shortfalls setting), and creates a leftover row when made > eaten.
// Used by both "I already cooked this" (no Cooking Mode) and Cooking Mode's
// Complete button (§5.6) — cooking_session has nothing to do with this file.
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { findOrCreateOpenShoppingList } from '../plan/shoppingListMutations';
import { getAutoAddShortfalls } from '../settings/getSetting';
import { computeConsumption, type ConsumptionIngredientInput } from './pantryConsumption';
import { computeLeftoverPlan } from './leftover';
import type { BaseUnit, RecipeUnit } from '../seed/types';

export interface CompleteCookInput {
  recipeId: number;
  cookedAt: string;
  servingsMade: number;
  servingsEaten: number;
  stars: number | null;
  notes?: string;
  viaCookingMode?: boolean;
}

export interface CompleteCookResult {
  cookLogId: number;
  leftoverId: number | null;
  shortfalls: { canonicalId: number; displayName: string; baseUnit: BaseUnit; amount: number }[];
}

export interface RecipeIngredientForConsumption extends ConsumptionIngredientInput {
  displayName: string;
}

export async function loadIngredientsForConsumption(
  db: DbClient,
  recipeId: number,
): Promise<{ baseServings: number; ingredients: RecipeIngredientForConsumption[] }> {
  const recipe = await db.getFirstAsync<{ base_servings: number }>('SELECT base_servings FROM recipe WHERE id = ?', [
    recipeId,
  ]);
  if (!recipe) throw new Error(`Recipe ${recipeId} not found`);

  const rows = await db.getAllAsync<{
    canonical_id: number | null;
    display_name: string;
    quantity: number;
    unit: RecipeUnit;
    scalable: number;
    base_unit: BaseUnit | null;
    pack_size: number | null;
    density: number | null;
    pantry_quantity: number | null;
  }>(
    `SELECT ri.canonical_id, ri.display_name, ri.quantity, ri.unit, ri.scalable,
            ci.base_unit, ci.pack_size, ci.density, pi.quantity as pantry_quantity
     FROM recipe_ingredient ri
     LEFT JOIN canonical_ingredient ci ON ci.id = ri.canonical_id
     LEFT JOIN pantry_item pi ON pi.canonical_id = ri.canonical_id
     WHERE ri.recipe_id = ?`,
    [recipeId],
  );

  return {
    baseServings: recipe.base_servings,
    ingredients: rows.map((r) => ({
      canonicalId: r.canonical_id,
      displayName: r.display_name,
      quantity: r.quantity,
      unit: r.unit,
      scalable: r.scalable === 1,
      baseUnit: r.base_unit ?? 'g',
      packSize: r.pack_size,
      density: r.density,
      pantryQuantity: r.pantry_quantity,
    })),
  };
}

// The manual counterpart to the auto-add path above, for when
// auto_add_shortfalls is off (§5.7): the shortfall line still shows, with a
// button that calls this instead of the app inserting it automatically.
export async function addShortfallToShoppingList(
  db: DbClient,
  line: { canonicalId: number; displayName: string; baseUnit: BaseUnit; amount: number },
): Promise<void> {
  const listId = await findOrCreateOpenShoppingList(db);
  await db.runAsync(
    `INSERT INTO shopping_list_item (list_id, canonical_id, display_name, quantity, unit, manual)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [listId, line.canonicalId, line.displayName, line.amount, line.baseUnit],
  );
}

export async function completeCook(db: DbClient, input: CompleteCookInput): Promise<CompleteCookResult> {
  const { baseServings, ingredients } = await loadIngredientsForConsumption(db, input.recipeId);
  const consumption = computeConsumption(ingredients, baseServings, input.servingsMade);
  const byCanonicalId = new Map(ingredients.map((i) => [i.canonicalId, i]));
  const autoAdd = await getAutoAddShortfalls(db);

  await db.execAsync('BEGIN');
  try {
    const cookLogResult = await db.runAsync(
      `INSERT INTO cook_log (recipe_id, cooked_at, servings_made, servings_eaten, stars, notes, via_cooking_mode)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.recipeId,
        input.cookedAt,
        input.servingsMade,
        input.servingsEaten,
        input.stars,
        input.notes || null,
        input.viaCookingMode ? 1 : 0,
      ],
    );
    const cookLogId = cookLogResult.lastInsertRowId;

    const shortfalls: CompleteCookResult['shortfalls'] = [];
    let shoppingListId: number | null = null;

    for (const line of consumption) {
      if (line.remainingPantryQuantity <= 0) {
        await db.runAsync('DELETE FROM pantry_item WHERE canonical_id = ?', [line.canonicalId]);
      } else {
        await db.runAsync(
          `UPDATE pantry_item SET quantity = ?, updated_at = datetime('now') WHERE canonical_id = ?`,
          [line.remainingPantryQuantity, line.canonicalId],
        );
      }
      if (line.deductedBaseUnits > 0) {
        await db.runAsync(
          `INSERT INTO pantry_movement (canonical_id, delta, reason, cook_log_id) VALUES (?, ?, 'cook', ?)`,
          [line.canonicalId, -line.deductedBaseUnits, cookLogId],
        );
      }

      if (line.realShortfall) {
        const ing = byCanonicalId.get(line.canonicalId)!;
        shortfalls.push({
          canonicalId: line.canonicalId,
          displayName: ing.displayName,
          baseUnit: ing.baseUnit,
          amount: line.shortfallBaseUnits,
        });

        if (autoAdd) {
          if (shoppingListId == null) shoppingListId = await findOrCreateOpenShoppingList(db);
          await db.runAsync(
            `INSERT INTO shopping_list_item (list_id, canonical_id, display_name, quantity, unit, manual)
             VALUES (?, ?, ?, ?, ?, 1)`,
            [shoppingListId, line.canonicalId, ing.displayName, line.shortfallBaseUnits, ing.baseUnit],
          );
        }
      }
    }

    let leftoverId: number | null = null;
    const leftoverPlan = computeLeftoverPlan(input.servingsMade, input.servingsEaten, input.cookedAt);
    if (leftoverPlan) {
      const leftoverResult = await db.runAsync(
        'INSERT INTO leftover (cook_log_id, servings_remaining, expires_at) VALUES (?, ?, ?)',
        [cookLogId, leftoverPlan.servingsRemaining, leftoverPlan.expiresAt],
      );
      leftoverId = leftoverResult.lastInsertRowId;
    }

    await db.execAsync('COMMIT');
    logger.info('db', 'Cook completed', { recipeId: input.recipeId, cookLogId, shortfalls: shortfalls.length });
    return { cookLogId, leftoverId, shortfalls };
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
}
