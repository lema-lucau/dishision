import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { loadRecipeCookGroups, sortRecipeCookGroups } from '../../cooking/cookLogGroups';
import { createTestDb } from '../support/testDb';

async function insertRecipe(db: DbClient, shareId: string, name: string): Promise<number> {
  const r = await db.runAsync(
    `INSERT INTO recipe (share_id, name, photo_emoji, base_servings, timeline_mode, source) VALUES (?, ?, '🍽️', 2, 'sequential', 'manual')`,
    [shareId, name],
  );
  return r.lastInsertRowId;
}

async function insertCook(db: DbClient, recipeId: number, cookedAt: string, stars: number | null): Promise<void> {
  await db.runAsync(
    `INSERT INTO cook_log (recipe_id, cooked_at, servings_made, stars, completed) VALUES (?, ?, 2, ?, 1)`,
    [recipeId, cookedAt, stars],
  );
}

describe('cookLogGroups (§B4 By Recipe)', () => {
  let db: DbClient;
  let curry: number;
  let soup: number;
  beforeEach(async () => {
    db = await createTestDb();
    curry = await insertRecipe(db, 'c1', 'Curry');
    soup = await insertRecipe(db, 's1', 'Soup');
    // Curry: cooked 3×, avg of rated (4,2) = 3, last 2026-03-01.
    await insertCook(db, curry, '2026-01-01T18:00:00.000Z', 4);
    await insertCook(db, curry, '2026-02-01T18:00:00.000Z', 2);
    await insertCook(db, curry, '2026-03-01T18:00:00.000Z', null);
    // Soup: cooked 1×, rated 5, last 2026-02-15.
    await insertCook(db, soup, '2026-02-15T18:00:00.000Z', 5);
  });

  it('aggregates count, last cooked, and average of rated cooks', async () => {
    const groups = await loadRecipeCookGroups(db);
    const c = groups.find((g) => g.recipeId === curry)!;
    expect(c.timesCooked).toBe(3);
    expect(c.lastCookedAt).toBe('2026-03-01T18:00:00.000Z');
    expect(c.avgStars).toBe(3); // (4 + 2) / 2, the unrated cook excluded
    const s = groups.find((g) => g.recipeId === soup)!;
    expect(s.avgStars).toBe(5);
  });

  it('sorts by most cooked, most recent, and highest rated', async () => {
    const groups = await loadRecipeCookGroups(db);
    expect(sortRecipeCookGroups(groups, 'mostCooked')[0].recipeId).toBe(curry); // 3 vs 1
    expect(sortRecipeCookGroups(groups, 'mostRecent')[0].recipeId).toBe(curry); // Mar 1 vs Feb 15
    expect(sortRecipeCookGroups(groups, 'highestRated')[0].recipeId).toBe(soup); // 5 vs 3
  });
});
