import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { setSetting } from '../../settings/setSetting';
import { dismissCostPrompt, loadStaleIngredients, shouldShowCostPrompt, updateIngredientCost } from '../../profile/costStaleness';
import { createTestDb } from '../support/testDb';

async function insertIngredient(db: DbClient, name: string, costPer100: number | null, costUpdatedAt: string | null): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO canonical_ingredient (name, base_unit, cost_per_100, cost_updated_at, source) VALUES (?, 'g', ?, ?, 'seed')`,
    [name, costPer100, costUpdatedAt],
  );
  return result.lastInsertRowId;
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe('cost staleness (§6.9)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('flags ingredients priced longer ago than the threshold, oldest first', async () => {
    await insertIngredient(db, 'Fresh', 1, daysAgoIso(10));
    const staleId = await insertIngredient(db, 'Very stale', 1, daysAgoIso(200));
    await insertIngredient(db, 'Stale', 1, daysAgoIso(100));
    await insertIngredient(db, 'Never priced', null, daysAgoIso(200)); // no cost -> not "stale", nothing to check

    const stale = await loadStaleIngredients(db, 90);
    expect(stale.map((s) => s.name)).toEqual(['Very stale', 'Stale']);
    expect(stale[0].id).toBe(staleId);
  });

  it('"never" threshold (0) disables staleness checking entirely', async () => {
    await insertIngredient(db, 'Ancient', 1, daysAgoIso(1000));
    expect(await loadStaleIngredients(db, 0)).toEqual([]);
  });

  it('shows the prompt when never dismissed, and re-arms 30 days after dismissal', async () => {
    await insertIngredient(db, 'Stale', 1, daysAgoIso(100));
    expect(await shouldShowCostPrompt(db)).toBe(true);

    await dismissCostPrompt(db);
    expect(await shouldShowCostPrompt(db)).toBe(false);

    // 29 days later — still suppressed.
    const soon = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000);
    expect(await shouldShowCostPrompt(db, soon)).toBe(false);

    // 31 days later — re-armed.
    const later = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
    expect(await shouldShowCostPrompt(db, later)).toBe(true);
  });

  it('does not prompt when nothing is stale', async () => {
    await insertIngredient(db, 'Fresh', 1, daysAgoIso(5));
    expect(await shouldShowCostPrompt(db)).toBe(false);
  });

  it('updateIngredientCost bumps cost_updated_at and nulls the median cache', async () => {
    await setSetting(db, 'median_cost_per_serving', '3.5');
    const originalUpdatedAt = daysAgoIso(200);
    const id = await insertIngredient(db, 'Onion', 1, originalUpdatedAt);

    await updateIngredientCost(db, id, 2.5);

    const row = await db.getFirstAsync<{ cost_per_100: number; cost_updated_at: string }>(
      'SELECT cost_per_100, cost_updated_at FROM canonical_ingredient WHERE id = ?',
      [id],
    );
    expect(row?.cost_per_100).toBe(2.5);
    expect(row?.cost_updated_at).not.toBe(originalUpdatedAt);
    // No longer 200 days stale, so it drops out of the stale list entirely.
    const stillStale = await loadStaleIngredients(db, 90);
    expect(stillStale.find((s) => s.id === id)).toBeUndefined();

    const cache = await db.getFirstAsync<{ value: string | null }>('SELECT value FROM setting WHERE key = ?', ['median_cost_per_serving']);
    expect(cache).toBeNull();
  });
});
