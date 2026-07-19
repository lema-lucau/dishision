import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { createCookLog, deleteCookLog, loadCookLogs, updateCookLog, type CookLogDraft } from '../../cooking/cookLog';
import { completeCook } from '../../cooking/completeCook';
import { createTestDb } from '../support/testDb';

function draft(overrides: Partial<CookLogDraft> = {}): CookLogDraft {
  return {
    recipeId: 1,
    cookedAt: '2026-07-16T18:00:00.000Z',
    servingsMade: 2,
    servingsEaten: 2,
    stars: 4,
    notes: 'Turned out great',
    whatWentWell: '',
    whatToChange: '',
    quickTags: ['perfect'],
    photos: [],
    viaCookingMode: false,
    ...overrides,
  };
}

async function insertRecipe(db: DbClient): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO recipe (share_id, name, photo_emoji, base_servings, timeline_mode, source) VALUES ('share-1', 'Curry', '🍛', 2, 'sequential', 'manual')`,
  );
  return result.lastInsertRowId;
}

describe('cook_log CRUD (§5.9, §2.5)', () => {
  let db: DbClient;
  let recipeId: number;

  beforeEach(async () => {
    db = await createTestDb();
    recipeId = await insertRecipe(db);
  });

  it('creates a log with quick tags and derives it back out via loadCookLogs', async () => {
    const id = await createCookLog(db, draft({ recipeId }));
    const [log] = await loadCookLogs(db, { recipeId });
    expect(log.id).toBe(id);
    expect(log.stars).toBe(4);
    expect(log.quickTags).toEqual(['perfect']);
  });

  it('update replaces tags rather than accumulating them', async () => {
    const id = await createCookLog(db, draft({ recipeId, quickTags: ['perfect'] }));
    await updateCookLog(db, id, draft({ recipeId, quickTags: ['too salty', 'would repeat'] }));
    const [log] = await loadCookLogs(db, { recipeId });
    expect(log.quickTags.sort()).toEqual(['too salty', 'would repeat']);
  });

  it('deleting a log decrements the derived count, and its leftover cascades away (§2.5, §2.6)', async () => {
    const result = await completeCook(db, {
      recipeId,
      cookedAt: '2026-07-16T18:00:00.000Z',
      servingsMade: 4,
      servingsEaten: 2,
      stars: 5,
    });
    const secondLog = await createCookLog(db, draft({ recipeId, servingsMade: 2, servingsEaten: 2 }));

    const countBefore = await db.getFirstAsync<{ c: number }>(
      'SELECT COUNT(*) as c FROM cook_log WHERE recipe_id = ? AND completed = 1',
      [recipeId],
    );
    expect(countBefore?.c).toBe(2);

    await deleteCookLog(db, result.cookLogId);

    const countAfter = await db.getFirstAsync<{ c: number }>(
      'SELECT COUNT(*) as c FROM cook_log WHERE recipe_id = ? AND completed = 1',
      [recipeId],
    );
    expect(countAfter?.c).toBe(1);

    const leftover = await db.getFirstAsync('SELECT 1 FROM leftover WHERE cook_log_id = ?', [result.cookLogId]);
    expect(leftover).toBeNull();

    // the unrelated second log survives
    const remaining = await db.getFirstAsync('SELECT 1 FROM cook_log WHERE id = ?', [secondLog]);
    expect(remaining).not.toBeNull();
  });

  it('filters by recipe, date range, minimum stars, and tag', async () => {
    await createCookLog(db, draft({ recipeId, cookedAt: '2026-01-01T00:00:00.000Z', stars: 2, quickTags: ['too salty'] }));
    await createCookLog(db, draft({ recipeId, cookedAt: '2026-07-01T00:00:00.000Z', stars: 5, quickTags: ['perfect'] }));

    const byStars = await loadCookLogs(db, { minStars: 4 });
    expect(byStars).toHaveLength(1);
    expect(byStars[0].stars).toBe(5);

    const byTag = await loadCookLogs(db, { tags: ['too salty'] });
    expect(byTag).toHaveLength(1);
    expect(byTag[0].stars).toBe(2);

    const byDate = await loadCookLogs(db, { dateFrom: '2026-06-01T00:00:00.000Z' });
    expect(byDate).toHaveLength(1);
  });

  it('multi-select tags use AND logic', async () => {
    const both = await createCookLog(db, draft({ recipeId, quickTags: ['too salty', 'would repeat'] }));
    await createCookLog(db, draft({ recipeId, quickTags: ['too salty'] }));

    const result = await loadCookLogs(db, { tags: ['too salty', 'would repeat'] });
    expect(result.map((r) => r.id)).toEqual([both]);
  });

  it('logId filter looks up a single log directly (Plan -> Cook Log deep link)', async () => {
    const id = await createCookLog(db, draft({ recipeId }));
    await createCookLog(db, draft({ recipeId }));

    const result = await loadCookLogs(db, { logId: id });
    expect(result.map((r) => r.id)).toEqual([id]);
  });

  it('creates a log with photos and reads them back in sort order (§8, §5.9)', async () => {
    const id = await createCookLog(db, draft({ recipeId, photos: ['file:///a.jpg', 'file:///b.jpg'] }));
    const [log] = await loadCookLogs(db, { logId: id });
    expect(log.photos).toEqual(['file:///a.jpg', 'file:///b.jpg']);
  });

  it('update replaces photos rather than accumulating them', async () => {
    const id = await createCookLog(db, draft({ recipeId, photos: ['file:///a.jpg'] }));
    await updateCookLog(db, id, draft({ recipeId, photos: ['file:///c.jpg', 'file:///d.jpg'] }));
    const [log] = await loadCookLogs(db, { logId: id });
    expect(log.photos).toEqual(['file:///c.jpg', 'file:///d.jpg']);
  });

  it('a log with no photos loads an empty array, not null/undefined', async () => {
    const id = await createCookLog(db, draft({ recipeId, photos: [] }));
    const [log] = await loadCookLogs(db, { logId: id });
    expect(log.photos).toEqual([]);
  });
});
