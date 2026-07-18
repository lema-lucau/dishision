import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { completeCook } from '../../cooking/completeCook';
import { binLeftover, eatLeftover, gcExpiredLeftovers, loadActiveLeftovers } from '../../cooking/leftoverMutations';
import { createTestDb } from '../support/testDb';

async function insertRecipe(db: DbClient, name = 'Chilli'): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO recipe (share_id, name, photo_emoji, base_servings, timeline_mode, source) VALUES (?, ?, '🌶️', 2, 'sequential', 'manual')`,
    [`share-${name}`, name],
  );
  return result.lastInsertRowId;
}

describe('leftover lifecycle (§5.2, §5.7, §11.2)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('cook 4/eat 2 -> leftover 2 -> eat 2 -> gone', async () => {
    const recipeId = await insertRecipe(db);
    const { leftoverId } = await completeCook(db, {
      recipeId,
      cookedAt: '2026-07-16T18:00:00.000Z',
      servingsMade: 4,
      servingsEaten: 2,
      stars: null,
    });
    expect(leftoverId).not.toBeNull();

    let leftovers = await loadActiveLeftovers(db, new Date('2026-07-16T19:00:00.000Z').getTime());
    expect(leftovers[0].servingsRemaining).toBe(2);

    await eatLeftover(db, leftoverId!, 1);
    leftovers = await loadActiveLeftovers(db, new Date('2026-07-16T19:00:00.000Z').getTime());
    expect(leftovers[0].servingsRemaining).toBe(1);

    await eatLeftover(db, leftoverId!, 1);
    leftovers = await loadActiveLeftovers(db, new Date('2026-07-16T19:00:00.000Z').getTime());
    expect(leftovers).toHaveLength(0);

    const row = await db.getFirstAsync('SELECT 1 FROM leftover WHERE id = ?', [leftoverId]);
    expect(row).toBeNull();
  });

  it('binning deletes the row immediately regardless of remaining servings', async () => {
    const recipeId = await insertRecipe(db);
    const { leftoverId } = await completeCook(db, {
      recipeId,
      cookedAt: '2026-07-16T18:00:00.000Z',
      servingsMade: 4,
      servingsEaten: 1,
      stars: null,
    });

    await binLeftover(db, leftoverId!);
    const row = await db.getFirstAsync('SELECT 1 FROM leftover WHERE id = ?', [leftoverId]);
    expect(row).toBeNull();
  });

  it('a leftover past its expiry simply stops appearing, and GC removes it on app open', async () => {
    const recipeId = await insertRecipe(db);
    const cookedAt = '2026-07-01T18:00:00.000Z';
    const { leftoverId } = await completeCook(db, {
      recipeId,
      cookedAt,
      servingsMade: 4,
      servingsEaten: 1,
      stars: null,
    });

    const afterExpiry = new Date('2026-07-10T00:00:00.000Z').getTime(); // > cookedAt + 3 days
    const active = await loadActiveLeftovers(db, afterExpiry);
    expect(active).toHaveLength(0);

    const gcCount = await gcExpiredLeftovers(db, afterExpiry);
    expect(gcCount).toBe(1);
    const row = await db.getFirstAsync('SELECT 1 FROM leftover WHERE id = ?', [leftoverId]);
    expect(row).toBeNull();
  });
});
