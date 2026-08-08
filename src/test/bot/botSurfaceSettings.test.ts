import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { getAllSurfaceToggles, getSurfaceEnabled, setSurfaceEnabled } from '../../bot/botSurfaceSettings';
import { getWeeklyPlanningSettings, setBotPlanningHorizon, setBotPreferExisting } from '../../bot/botSettings';
import { createTestDb } from '../support/testDb';

describe('botSurfaceSettings (§A3.2)', () => {
  let db: DbClient;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it('every surface defaults to enabled', async () => {
    const toggles = await getAllSurfaceToggles(db);
    expect(Object.values(toggles).every((v) => v === true)).toBe(true);
    expect(await getSurfaceEnabled(db, 'cooking_quick_ask')).toBe(true);
  });

  it('turning a surface off persists and is per-surface', async () => {
    await setSurfaceEnabled(db, 'weekly_planning', false);
    expect(await getSurfaceEnabled(db, 'weekly_planning')).toBe(false);
    // Others are unaffected.
    expect(await getSurfaceEnabled(db, 'recipe_chat')).toBe(true);
    const toggles = await getAllSurfaceToggles(db);
    expect(toggles.weekly_planning).toBe(false);
    expect(toggles.recipe_chat).toBe(true);
  });
});

describe('weekly planning settings (§A3.1)', () => {
  let db: DbClient;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it('defaults to a 7-day horizon, strongly preferring existing recipes', async () => {
    const s = await getWeeklyPlanningSettings(db);
    expect(s).toEqual({ horizon: '7', preferExisting: 'strongly' });
  });

  it('persists changes', async () => {
    await setBotPlanningHorizon(db, '3');
    await setBotPreferExisting(db, 'open');
    expect(await getWeeklyPlanningSettings(db)).toEqual({ horizon: '3', preferExisting: 'open' });
  });
});
