import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { createChat } from '../../bot/chatRepo';
import { loadBotUsageStats, logUsage, weekStartKey } from '../../bot/usageRepo';
import { DEFAULT_BOT_SETTINGS } from '../../bot/types';
import { createTestDb } from '../support/testDb';

describe('usageRepo (§12)', () => {
  let db: DbClient;
  let chatId: string;
  beforeEach(async () => {
    db = await createTestDb();
    chatId = (await createChat(db, { source: 'chat', settings: { ...DEFAULT_BOT_SETTINGS } })).id;
  });

  it('logs a usage row with a stored USD cost', async () => {
    await logUsage(db, { chatId, model: 'haiku', inputTokens: 1_000_000, outputTokens: 1_000_000 });
    const row = await db.getFirstAsync<{ estimated_cost: number }>('SELECT estimated_cost FROM bot_usage_log');
    expect(row?.estimated_cost).toBeCloseTo(6, 6);
  });

  it('aggregates overall, by-model, and an adaptive cost series', async () => {
    await logUsage(db, { chatId, model: 'haiku', inputTokens: 1_000_000, outputTokens: 0 });
    await logUsage(db, { chatId, model: 'claude-sonnet-5', inputTokens: 1_000_000, outputTokens: 0 });
    const stats = await loadBotUsageStats(db);
    expect(stats.overall.calls).toBe(2);
    expect(stats.overall.inputTokens).toBe(2_000_000);
    expect(stats.byModel.map((m) => m.model).sort()).toEqual(['haiku', 'sonnet']);
    // The cost series has bars, and the recorded cost lands in one of them.
    expect(stats.buckets.length).toBeGreaterThanOrEqual(1);
    const bucketCost = stats.buckets.reduce((sum, b) => sum + (b.value ?? 0), 0);
    expect(bucketCost).toBeCloseTo(stats.overall.costUsd, 6);
  });

  it('respects the window — a call outside it is excluded', async () => {
    await logUsage(db, { chatId, model: 'haiku', inputTokens: 1_000_000, outputTokens: 0 });
    await db.runAsync("UPDATE bot_usage_log SET created_at = '2020-01-01 00:00:00'");
    const stats = await loadBotUsageStats(db, { windowDays: 30, now: new Date('2026-08-10T12:00:00') });
    expect(stats.overall.calls).toBe(0);
  });

  it('computes a Monday-anchored week key', () => {
    // 2026-08-07 is a Friday → the week's Monday is 2026-08-03.
    expect(weekStartKey('2026-08-07T12:00:00Z')).toBe('2026-08-03');
  });
});
