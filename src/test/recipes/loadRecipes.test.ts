import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { loadEnrichedRecipes } from '../../recipes/loadRecipes';
import { createTestDb } from '../support/testDb';

async function insertIngredient(
  db: DbClient,
  overrides: Partial<{
    name: string;
    baseUnit: string;
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
    cost: number;
    density: number | null;
    packSize: number | null;
  }> = {},
): Promise<number> {
  const {
    name = 'Chicken thigh',
    baseUnit = 'g',
    kcal = 200,
    protein = 20,
    carbs = 0,
    fat = 12,
    cost = 0.6,
    density = null,
    packSize = null,
  } = overrides;
  const result = await db.runAsync(
    `INSERT INTO canonical_ingredient (name, base_unit, kcal_per_100, protein_per_100, carbs_per_100, fat_per_100, cost_per_100, density, pack_size, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed')`,
    [name, baseUnit, kcal, protein, carbs, fat, cost, density, packSize],
  );
  return result.lastInsertRowId;
}

async function insertRecipe(
  db: DbClient,
  overrides: Partial<{ name: string; baseServings: number; timelineMode: string }> = {},
): Promise<number> {
  const { name = 'Thai Green Curry', baseServings = 2, timelineMode = 'sequential' } = overrides;
  const result = await db.runAsync(
    `INSERT INTO recipe (share_id, name, photo_emoji, base_servings, timeline_mode, source)
     VALUES (?, ?, '🍛', ?, ?, 'manual')`,
    [`share-${name}`, name, baseServings, timelineMode],
  );
  return result.lastInsertRowId;
}

describe('loadEnrichedRecipes (§2.5, §3, §4.7)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('derives per-serving macros and cost from measured ingredients', async () => {
    const chickenId = await insertIngredient(db, { name: 'Chicken thigh', kcal: 200, cost: 0.6 });
    const recipeId = await insertRecipe(db, { baseServings: 2 });
    await db.runAsync(
      `INSERT INTO recipe_ingredient (recipe_id, canonical_id, display_name, quantity, unit, scalable, optional, sort_order)
       VALUES (?, ?, 'Chicken thigh', 400, 'g', 1, 0, 0)`,
      [recipeId, chickenId],
    );

    const [recipe] = await loadEnrichedRecipes(db);
    // 400g at 200kcal/100g = 800kcal total / 2 servings = 400kcal/serving
    expect(recipe.kcalPerServing).toBe(400);
    // 400g at 0.6/100g = 2.4 total / 2 servings = 1.2/serving
    expect(recipe.costPerServing).toBeCloseTo(1.2, 5);
    expect(recipe.macroCompleteCount).toBe(1);
    expect(recipe.totalIngredientCount).toBe(1);
  });

  it('flags partial data when an ingredient has no canonical match ("N of M")', async () => {
    const chickenId = await insertIngredient(db);
    const recipeId = await insertRecipe(db);
    await db.runAsync(
      `INSERT INTO recipe_ingredient (recipe_id, canonical_id, display_name, quantity, unit, scalable, optional, sort_order)
       VALUES (?, ?, 'Chicken thigh', 400, 'g', 1, 0, 0)`,
      [recipeId, chickenId],
    );
    await db.runAsync(
      `INSERT INTO recipe_ingredient (recipe_id, canonical_id, display_name, quantity, unit, scalable, optional, sort_order)
       VALUES (?, NULL, 'A pinch of magic', 1, 'unit', 0, 1, 1)`,
      [recipeId],
    );

    const [recipe] = await loadEnrichedRecipes(db);
    expect(recipe.totalIngredientCount).toBe(2);
    expect(recipe.macroCompleteCount).toBe(1);
    // macros still compute from the complete half rather than degrading to null
    expect(recipe.kcalPerServing).not.toBeNull();
  });

  it('reports pantry presence per ingredient, honouring staples and unmeasured fallback', async () => {
    const chickenId = await insertIngredient(db, { name: 'Chicken thigh' });
    const saltId = await insertIngredient(db, { name: 'Salt', baseUnit: 'g', kcal: 0, protein: 0, carbs: 0, fat: 0, cost: 0.01 });
    const recipeId = await insertRecipe(db);
    await db.runAsync(
      `INSERT INTO recipe_ingredient (recipe_id, canonical_id, display_name, quantity, unit, scalable, optional, sort_order)
       VALUES (?, ?, 'Chicken thigh', 400, 'g', 1, 0, 0)`,
      [recipeId, chickenId],
    );
    await db.runAsync(
      `INSERT INTO recipe_ingredient (recipe_id, canonical_id, display_name, quantity, unit, scalable, optional, sort_order)
       VALUES (?, ?, 'Salt', 5, 'g', 0, 1, 1)`,
      [recipeId, saltId],
    );
    // Pantry only has 200g chicken — short of the 400g needed.
    await db.runAsync('INSERT INTO pantry_item (canonical_id, quantity) VALUES (?, 200)', [chickenId]);
    // Salt is a staple: always considered present regardless of quantity.
    await db.runAsync('INSERT INTO staple (canonical_id) VALUES (?)', [saltId]);

    const [recipe] = await loadEnrichedRecipes(db);
    const chicken = recipe.ingredients.find((i) => i.displayName === 'Chicken thigh')!;
    const salt = recipe.ingredients.find((i) => i.displayName === 'Salt')!;
    expect(chicken.inPantry).toBe(false);
    expect(salt.inPantry).toBe(true);
  });

  it('sums active/passive step time and derives sequential offsets cumulatively', async () => {
    const recipeId = await insertRecipe(db, { timelineMode: 'sequential' });
    await db.runAsync(
      `INSERT INTO recipe_step (recipe_id, phase, instruction, duration_seconds, effort, sort_order)
       VALUES (?, 'prep', 'Chop veg', 300, 'active', 0)`,
      [recipeId],
    );
    await db.runAsync(
      `INSERT INTO recipe_step (recipe_id, phase, instruction, duration_seconds, effort, sort_order)
       VALUES (?, 'cook', 'Simmer', 600, 'passive', 1)`,
      [recipeId],
    );

    const [recipe] = await loadEnrichedRecipes(db);
    expect(recipe.activeSeconds).toBe(300);
    expect(recipe.passiveSeconds).toBe(600);
    expect(recipe.totalSeconds).toBe(900);
    expect(recipe.steps[0].startOffsetSeconds).toBe(0);
    expect(recipe.steps[1].startOffsetSeconds).toBe(300);
  });

  it('handles the zero-ingredient / zero-step recipe without throwing', async () => {
    await insertRecipe(db, { name: 'Blank' });
    const [recipe] = await loadEnrichedRecipes(db);
    expect(recipe.kcalPerServing).toBeNull();
    expect(recipe.costPerServing).toBeNull();
    expect(recipe.totalSeconds).toBe(0);
  });
});
