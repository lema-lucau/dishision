import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { applyReceivedSharedCooks, listPendingSharedCooks, markSharedCooksSynced, queueSharedCook } from '../../household/sharedCooks';
import { loadSyncLog } from '../../household/loadSyncLog';
import { createManualRecipe, type RecipeDraft } from '../../recipes/recipeSave';
import { createTestDb } from '../support/testDb';

function baseDraft(overrides: Partial<RecipeDraft> = {}): RecipeDraft {
  return {
    name: 'Carbonara',
    description: '',
    photoEmoji: '🍝',
    baseServings: 2,
    timelineMode: 'sequential',
    originLabel: '',
    lanes: [],
    ingredients: [],
    steps: [],
    tags: [],
    ...overrides,
  };
}

const cook = (recipeShareId: string, recipeName = 'Carbonara') => ({
  recipeShareId,
  recipeName,
  cookedAt: '2026-07-01T18:00:00.000Z',
  servingsMade: 2,
  servingsEaten: 2,
  stars: 4,
  notes: null,
});

describe('shared cooks', () => {
  let db: DbClient;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it('queues, lists, and clears outbox entries', async () => {
    await queueSharedCook(db, 'tara-1', cook('share-a'));
    await queueSharedCook(db, 'tara-1', cook('share-b'));
    const pending = await listPendingSharedCooks(db, 'tara-1');
    expect(pending).toHaveLength(2);

    await markSharedCooksSynced(db, [pending[0].id]);
    expect(await listPendingSharedCooks(db, 'tara-1')).toHaveLength(1);
  });

  it('applies a received cook as a cook_log against the matching recipe', async () => {
    const recipeId = await createManualRecipe(db, baseDraft());
    const shareId = (await db.getFirstAsync<{ share_id: string }>('SELECT share_id FROM recipe WHERE id = ?', [recipeId]))!.share_id;

    const { applied, skipped } = await applyReceivedSharedCooks(db, [cook(shareId)]);
    expect(applied).toHaveLength(1);
    expect(skipped).toBe(0);
    const logs = await db.getAllAsync('SELECT * FROM cook_log');
    expect(logs).toHaveLength(1);
  });

  it('skips a cook for a recipe the recipient does not have', async () => {
    const { applied, skipped } = await applyReceivedSharedCooks(db, [cook('unknown-share')]);
    expect(applied).toHaveLength(0);
    expect(skipped).toBe(1);
    expect(await db.getAllAsync('SELECT * FROM cook_log')).toHaveLength(0);
  });
});

describe('loadSyncLog', () => {
  let db: DbClient;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it('returns events within the window, newest first, joined to member names', async () => {
    await db.runAsync('INSERT INTO household_member (person_id, display_name, avatar_emoji, sync_secret) VALUES (?, ?, ?, ?)', ['tara-1', 'Tara', '🥑', 's']);
    const now = new Date('2026-07-30T12:00:00.000Z');
    const recent = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const old = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();
    await db.runAsync('INSERT INTO sync_event (person_id, direction, kind, item_count, created_at) VALUES (?, ?, ?, ?, ?)', ['tara-1', 'received', 'recipes', 2, recent]);
    await db.runAsync('INSERT INTO sync_event (person_id, direction, kind, item_count, created_at) VALUES (?, ?, ?, ?, ?)', ['tara-1', 'sent', 'shared_cooks', 1, old]);

    const within7 = await loadSyncLog(db, 7, now);
    expect(within7).toHaveLength(1);
    expect(within7[0]).toMatchObject({ memberName: 'Tara', kind: 'recipes', itemCount: 2 });

    const within60 = await loadSyncLog(db, 60, now);
    expect(within60).toHaveLength(2);
  });
});
