// §5.6 ready state: entering Cooking Mode must not start the clock. The
// state is deliberately the existing *paused* state, so this suite also
// proves the things that fall out of that for free — nothing scheduled, and
// a kill/reopen that lands back at 0:00 rather than mid-cook.
import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import {
  advanceToStep,
  beginClock,
  findUnfinishedSession,
  isReadySession,
  loadStepRuntime,
  startSession,
} from '../../cooking/session';
import { computeElapsedSeconds, computeNotificationSchedule } from '../../cooking/sessionClock';
import { createTestDb } from '../support/testDb';

async function insertRecipeWithSteps(db: DbClient): Promise<{ recipeId: number; stepIds: number[] }> {
  const recipe = await db.runAsync(
    `INSERT INTO recipe (share_id, name, photo_emoji, base_servings, timeline_mode, source) VALUES ('share-1', 'Curry', '🍛', 2, 'sequential', 'manual')`,
  );
  const recipeId = recipe.lastInsertRowId;
  const stepIds: number[] = [];
  for (const [i, instruction] of ['Fry the paste', 'Simmer'].entries()) {
    const step = await db.runAsync(
      `INSERT INTO recipe_step (recipe_id, phase, instruction, duration_seconds, effort, sort_order) VALUES (?, 'cook', ?, 300, 'passive', ?)`,
      [recipeId, instruction, i],
    );
    stepIds.push(step.lastInsertRowId);
  }
  return { recipeId, stepIds };
}

describe('Cooking Mode ready state (§5.6)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('creates the session paused at zero — the clock does not start on entry', async () => {
    const { recipeId, stepIds } = await insertRecipeWithSteps(db);
    const id = await startSession(db, recipeId, 2, 'cook', stepIds[0], '2026-07-27T18:00:00.000Z', true);

    const session = await findUnfinishedSession(db, recipeId);
    expect(session?.id).toBe(id);
    expect(session?.pausedAt).not.toBeNull();
    expect(session?.elapsedSeconds).toBe(0);
    expect(isReadySession(session!)).toBe(true);
  });

  it('does not advance the clock while the cook reads the first step', async () => {
    const { recipeId, stepIds } = await insertRecipeWithSteps(db);
    await startSession(db, recipeId, 2, 'cook', stepIds[0], '2026-07-27T18:00:00.000Z', true);
    const session = (await findUnfinishedSession(db, recipeId))!;

    // Ten minutes of wall clock later, still zero.
    const tenMinutesOn = new Date('2026-07-27T18:10:00.000Z').getTime();
    expect(computeElapsedSeconds(session, tenMinutesOn)).toBe(0);
  });

  it('schedules nothing until the clock starts', async () => {
    const { recipeId, stepIds } = await insertRecipeWithSteps(db);
    const id = await startSession(db, recipeId, 2, 'cook', stepIds[0], '2026-07-27T18:00:00.000Z', true);
    const session = (await findUnfinishedSession(db, recipeId))!;
    await advanceToStep(db, session, stepIds[0], '2026-07-27T18:00:00.000Z');

    const runtime = await loadStepRuntime(db, id, session.startedAt);
    const timings = stepIds.map((stepId, i) => ({
      id: stepId,
      scheduledStartOffsetSeconds: i * 300,
      durationSeconds: 300,
      effort: 'passive' as const,
      important: false,
    }));
    expect(computeNotificationSchedule(timings, runtime, 0, true)).toEqual([]);
  });

  it('rebases the clock onto the moment Start was tapped, so waiting is not drift', async () => {
    const { recipeId, stepIds } = await insertRecipeWithSteps(db);
    const id = await startSession(db, recipeId, 2, 'cook', stepIds[0], '2026-07-27T18:00:00.000Z', true);
    let session = (await findUnfinishedSession(db, recipeId))!;
    await advanceToStep(db, session, stepIds[0], '2026-07-27T18:00:00.000Z');
    session = (await findUnfinishedSession(db, recipeId))!;

    // Cook reads the step for ten minutes, then starts.
    await beginClock(db, session, '2026-07-27T18:10:00.000Z');
    const running = (await findUnfinishedSession(db, recipeId))!;

    expect(running.pausedAt).toBeNull();
    expect(running.elapsedSeconds).toBe(0);
    expect(running.startedAt).toBe('2026-07-27T18:10:00.000Z');
    expect(isReadySession(running)).toBe(false);

    // One minute into the cook, elapsed is one minute — not eleven.
    const oneMinuteIn = new Date('2026-07-27T18:11:00.000Z').getTime();
    expect(computeElapsedSeconds(running, oneMinuteIn)).toBeCloseTo(60, 0);

    // And the first step's recorded start moved with it, so it isn't
    // reported as having been running through the wait.
    const runtime = await loadStepRuntime(db, id, running.startedAt);
    expect(runtime.get(stepIds[0])?.actualStartOffsetSeconds).toBe(0);
  });

  it('resumes into the ready state after a kill, never mid-cook', async () => {
    const { recipeId, stepIds } = await insertRecipeWithSteps(db);
    await startSession(db, recipeId, 2, 'cook', stepIds[0], '2026-07-27T18:00:00.000Z', true);

    // "Kill and reopen" is just re-reading the row.
    const reopened = (await findUnfinishedSession(db, recipeId))!;
    expect(isReadySession(reopened)).toBe(true);
    expect(computeElapsedSeconds(reopened, new Date('2026-07-28T09:00:00.000Z').getTime())).toBe(0);
  });

  it('still supports the old behaviour for a session started running', async () => {
    const { recipeId, stepIds } = await insertRecipeWithSteps(db);
    await startSession(db, recipeId, 2, 'cook', stepIds[0], '2026-07-27T18:00:00.000Z');
    const session = (await findUnfinishedSession(db, recipeId))!;
    expect(session.pausedAt).toBeNull();
    expect(isReadySession(session)).toBe(false);
  });
});
