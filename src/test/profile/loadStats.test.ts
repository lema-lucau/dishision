import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { createUserIngredient } from '../../recipes/ingredientSearch';
import { createManualRecipe, type RecipeDraft } from '../../recipes/recipeSave';
import { computeTrend, loadStats, mondayOfWeek } from '../../profile/loadStats';
import { createTestDb } from '../support/testDb';

describe('computeTrend', () => {
  it('reports up/down/flat from the recent vs previous half', () => {
    expect(computeTrend([1, 1, 1, 1, 2, 2, 2, 2]).direction).toBe('up');
    expect(computeTrend([4, 4, 4, 4, 1, 1, 1, 1]).direction).toBe('down');
    expect(computeTrend([2, 2, 2, 2, 2, 2, 2, 2]).direction).toBe('flat');
  });

  it('ignores null weeks and reports flat without enough data', () => {
    expect(computeTrend([null, null, null, null]).changePct).toBeNull();
    expect(computeTrend([2, null, null, 4]).direction).toBe('up');
  });
});

function baseDraft(overrides: Partial<RecipeDraft> = {}): RecipeDraft {
  return {
    name: 'Chicken Katsu',
    description: '',
    photoEmoji: '🍛',
    baseServings: 2,
    timelineMode: 'sequential',
    originLabel: '',
    lanes: [],
    ingredients: [],
    steps: [],
    tags: ['chicken'],
    ...overrides,
  };
}

async function insertCookLog(db: DbClient, recipeId: number, cookedAt: string, servingsMade = 2, stars: number | null = null): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO cook_log (recipe_id, cooked_at, servings_made, servings_eaten, stars, completed) VALUES (?, ?, ?, ?, ?, 1)`,
    [recipeId, cookedAt, servingsMade, servingsMade, stars],
  );
  return result.lastInsertRowId;
}

describe('mondayOfWeek', () => {
  it('resolves any day in a week to that week\'s Monday', () => {
    expect(mondayOfWeek('2026-07-20')).toBe('2026-07-20'); // a Monday
    expect(mondayOfWeek('2026-07-21')).toBe('2026-07-20'); // Tuesday
    expect(mondayOfWeek('2026-07-26')).toBe('2026-07-20'); // Sunday
    expect(mondayOfWeek('2026-07-19')).toBe('2026-07-13'); // previous Sunday
  });
});

describe('loadStats (§5.10)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('reports zeroed stats with an empty log', async () => {
    const stats = await loadStats(db, 4, new Date('2026-07-21T12:00:00Z'));
    expect(stats.totalCooks).toBe(0);
    expect(stats.distinctRecipesCooked).toBe(0);
    expect(stats.mostCooked).toBeNull();
    expect(stats.cookedDaysLast30).toBe(0);
    expect(stats.cooksPerWeek).toHaveLength(4);
    expect(stats.cooksPerWeek.every((w) => w.cooks === 0)).toBe(true);
  });

  it('counts total cooks, distinct recipes, and the most-cooked recipe', async () => {
    const chickenId = await createManualRecipe(db, baseDraft({ name: 'Chicken Katsu' }));
    const beefId = await createManualRecipe(db, baseDraft({ name: 'Beef Chilli', tags: ['beef'] }));

    await insertCookLog(db, chickenId, '2026-07-14T18:00:00Z');
    await insertCookLog(db, chickenId, '2026-07-16T18:00:00Z');
    await insertCookLog(db, chickenId, '2026-07-18T18:00:00Z');
    await insertCookLog(db, beefId, '2026-07-19T18:00:00Z');

    const stats = await loadStats(db, 4, new Date('2026-07-21T12:00:00Z'));
    expect(stats.totalCooks).toBe(4);
    expect(stats.distinctRecipesCooked).toBe(2);
    expect(stats.mostCooked).toMatchObject({ recipeId: chickenId, name: 'Chicken Katsu', count: 3 });
  });

  it('"cooked X of the last 30 days" counts distinct calendar days, not cook count', async () => {
    const recipeId = await createManualRecipe(db, baseDraft());
    // Two cooks on the same day should count once.
    await insertCookLog(db, recipeId, '2026-07-14T12:00:00Z');
    await insertCookLog(db, recipeId, '2026-07-14T19:00:00Z');
    await insertCookLog(db, recipeId, '2026-07-16T19:00:00Z');
    // Outside the 30-day window.
    await insertCookLog(db, recipeId, '2026-05-01T19:00:00Z');

    const stats = await loadStats(db, 4, new Date('2026-07-21T12:00:00Z'));
    expect(stats.cookedDaysLast30).toBe(2);
  });

  it('buckets cooks and ratings per week, and derives nutrition/spend from recipe macros', async () => {
    const chicken = await createUserIngredient(db, 'Chicken thigh', 'g');
    await db.runAsync(
      'UPDATE canonical_ingredient SET kcal_per_100 = 200, protein_per_100 = 25, carbs_per_100 = 0, fat_per_100 = 10, cost_per_100 = 1 WHERE id = ?',
      [chicken.id],
    );
    const recipeId = await createManualRecipe(
      db,
      baseDraft({
        baseServings: 2,
        ingredients: [{ canonicalId: chicken.id, displayName: 'Chicken thigh', quantity: 400, unit: 'g', scalable: true, optional: false }],
      }),
    );
    // 400g at 200kcal/100g = 800kcal total / 2 servings = 400kcal/serving; cost = 400/100*1 = 4 / 2 = 2/serving.

    await insertCookLog(db, recipeId, '2026-07-14T18:00:00Z', 2, 4);
    await insertCookLog(db, recipeId, '2026-07-15T18:00:00Z', 4, 2);

    const stats = await loadStats(db, 4, new Date('2026-07-21T12:00:00Z'));
    const week = stats.cooksPerWeek.find((w) => w.weekStart === '2026-07-13');
    expect(week?.cooks).toBe(2);

    const rating = stats.ratingDrift.find((w) => w.weekStart === '2026-07-13');
    expect(rating?.avgStars).toBe(3); // (4 + 2) / 2

    const nutrition = stats.nutritionPerWeek.find((w) => w.weekStart === '2026-07-13');
    expect(nutrition?.avgKcal).toBe(400);

    const spend = stats.spendPerWeek.find((w) => w.weekStart === '2026-07-13');
    // costPerServing (2) * servingsMade summed across both cooks: 2*2 + 2*4 = 12
    expect(spend?.totalSpend).toBe(12);
    expect(spend?.avgCostPerServing).toBe(2);

    expect(stats.proteinDistribution).toEqual([{ tag: 'chicken', count: 2 }]);
  });

  it('ignores incomplete cook_log rows', async () => {
    const recipeId = await createManualRecipe(db, baseDraft());
    await db.runAsync(
      `INSERT INTO cook_log (recipe_id, cooked_at, servings_made, servings_eaten, completed) VALUES (?, '2026-07-14T18:00:00Z', 2, 2, 0)`,
      [recipeId],
    );
    const stats = await loadStats(db, 4, new Date('2026-07-21T12:00:00Z'));
    expect(stats.totalCooks).toBe(0);
  });
});
