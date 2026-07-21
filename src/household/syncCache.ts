// §7.5 steps 6-7: household_recipe_cache upsert + orphan cleanup. Macro/cost
// fields are denormalised (§2.3 DDL comment) but computed the same way any
// local recipe's macros are — by resolving each ingredient's canonical_name
// against THIS device's own canonical_ingredient table (reusing S13's
// resolver) and deriving with the same lib/derive.ts functions loadRecipes.ts
// uses. A recipe's cost/macros are inherently local to whoever's pricing
// data computes them; the cache is no different.
import type { DbClient } from '../db/DbClient';
import { deriveNutrition, deriveTimeSplit, type IngredientNutritionInput } from '../lib/derive';
import { convertToBaseUnit } from '../lib/units';
import { resolveCanonicalIngredientId } from '../sharing/resolveCanonicalIngredient';
import type { PayloadEntry } from './syncTypes';

interface CanonicalRow {
  base_unit: 'g' | 'ml' | 'unit';
  pack_size: number | null;
  density: number | null;
  kcal_per_100: number | null;
  protein_per_100: number | null;
  carbs_per_100: number | null;
  fat_per_100: number | null;
  cost_per_100: number | null;
}

async function computeCacheDerivedFields(db: DbClient, entry: PayloadEntry) {
  const inputs: IngredientNutritionInput[] = [];
  for (const ing of entry.payload.ingredients) {
    const canonicalId = await resolveCanonicalIngredientId(db, ing.canonical_name);
    const canon = canonicalId != null
      ? await db.getFirstAsync<CanonicalRow>(
          'SELECT base_unit, pack_size, density, kcal_per_100, protein_per_100, carbs_per_100, fat_per_100, cost_per_100 FROM canonical_ingredient WHERE id = ?',
          [canonicalId],
        )
      : null;
    if (!canon) {
      inputs.push({ quantityBase: null, kcalPer100: null, proteinPer100: null, carbsPer100: null, fatPer100: null, costPer100: null });
      continue;
    }
    const conversion = convertToBaseUnit({ baseUnit: canon.base_unit, packSize: canon.pack_size, density: canon.density }, ing.quantity, ing.unit);
    inputs.push({
      quantityBase: conversion.value,
      kcalPer100: canon.kcal_per_100,
      proteinPer100: canon.protein_per_100,
      carbsPer100: canon.carbs_per_100,
      fatPer100: canon.fat_per_100,
      costPer100: canon.cost_per_100,
    });
  }
  const nutrition = deriveNutrition(inputs, entry.payload.recipe.base_servings);
  const timeSplit = deriveTimeSplit(entry.payload.steps.map((s) => ({ effort: s.effort, durationSeconds: s.duration_seconds })));
  return {
    totalSeconds: timeSplit.totalSeconds,
    activeSeconds: timeSplit.activeSeconds,
    kcalPerServing: nutrition.kcalPerServing,
    costPerServing: nutrition.costPerServing,
  };
}

export async function upsertHouseholdCacheEntry(db: DbClient, personId: string, entry: PayloadEntry): Promise<void> {
  const derived = await computeCacheDerivedFields(db, entry);
  await db.runAsync(
    `INSERT INTO household_recipe_cache
       (person_id, share_id, payload, name, description, total_seconds, active_seconds, kcal_per_serving, cost_per_serving, is_favourite, favourited_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(person_id, share_id) DO UPDATE SET
       payload = excluded.payload,
       name = excluded.name,
       description = excluded.description,
       total_seconds = excluded.total_seconds,
       active_seconds = excluded.active_seconds,
       kcal_per_serving = excluded.kcal_per_serving,
       cost_per_serving = excluded.cost_per_serving,
       is_favourite = excluded.is_favourite,
       favourited_at = excluded.favourited_at,
       synced_at = datetime('now')`,
    [
      personId,
      entry.shareId,
      JSON.stringify(entry.payload),
      entry.payload.recipe.name,
      entry.payload.recipe.description,
      derived.totalSeconds,
      derived.activeSeconds,
      derived.kcalPerServing,
      derived.costPerServing,
      entry.isFavourite ? 1 : 0,
      entry.favouritedAt,
    ],
  );
}

// §7.5 step 7: "Delete cached rows whose share_id vanished from the
// manifest (they made it private or deleted it)."
export async function deleteVanishedCacheRows(db: DbClient, personId: string, keepShareIds: string[]): Promise<number> {
  if (keepShareIds.length === 0) {
    const result = await db.runAsync('DELETE FROM household_recipe_cache WHERE person_id = ?', [personId]);
    return result.changes;
  }
  const placeholders = keepShareIds.map(() => '?').join(', ');
  const result = await db.runAsync(
    `DELETE FROM household_recipe_cache WHERE person_id = ? AND share_id NOT IN (${placeholders})`,
    [personId, ...keepShareIds],
  );
  return result.changes;
}
