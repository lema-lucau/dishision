import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import {
  abandonSession,
  advanceToStep,
  completeStep,
  finishSession,
  findUnfinishedSession,
  loadStepRuntime,
  pauseSession,
  resumeSession,
  startSession,
} from '../../cooking/session';
import { computeElapsedSeconds, isSessionStale } from '../../cooking/sessionClock';
import { createTestDb } from '../support/testDb';

async function insertRecipeWithSteps(db: DbClient): Promise<{ recipeId: number; stepIds: number[] }> {
  const recipe = await db.runAsync(
    `INSERT INTO recipe (share_id, name, photo_emoji, base_servings, timeline_mode, source) VALUES ('share-1', 'Curry', '🍛', 2, 'sequential', 'manual')`,
  );
  const recipeId = recipe.lastInsertRowId;
  const stepIds: number[] = [];
  for (const [i, instruction] of ['Chop', 'Simmer'].entries()) {
    const step = await db.runAsync(
      `INSERT INTO recipe_step (recipe_id, phase, instruction, duration_seconds, effort, sort_order) VALUES (?, 'cook', ?, 300, 'active', ?)`,
      [recipeId, instruction, i],
    );
    stepIds.push(step.lastInsertRowId);
  }
  return { recipeId, stepIds };
}

describe('cooking_session persistence (§2.3, §5.6, §11.2)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('starts a session and finds it as unfinished for that recipe', async () => {
    const { recipeId, stepIds } = await insertRecipeWithSteps(db);
    const sessionId = await startSession(db, recipeId, 2, 'cook', stepIds[0], '2026-07-16T18:00:00.000Z');

    const found = await findUnfinishedSession(db, recipeId);
    expect(found?.id).toBe(sessionId);
    expect(found?.currentStepId).toBe(stepIds[0]);
    expect(found?.pausedAt).toBeNull();
  });

  it('12-hour staleness gates resume vs start-over', async () => {
    const { recipeId } = await insertRecipeWithSteps(db);
    await startSession(db, recipeId, 2, 'cook', null, '2026-07-16T06:00:00.000Z');
    const session = await findUnfinishedSession(db, recipeId);
    expect(isSessionStale(session!, new Date('2026-07-16T18:00:01.000Z').getTime())).toBe(true);
    expect(isSessionStale(session!, new Date('2026-07-16T17:00:00.000Z').getTime())).toBe(false);
  });

  it('"start over" abandons the old session outright', async () => {
    const { recipeId } = await insertRecipeWithSteps(db);
    const sessionId = await startSession(db, recipeId, 2, 'cook', null);
    await abandonSession(db, sessionId);
    expect(await findUnfinishedSession(db, recipeId)).toBeNull();
  });

  it('pause freezes elapsed time; resume continues the live projection from where it left off', async () => {
    const { recipeId, stepIds } = await insertRecipeWithSteps(db);
    const sessionId = await startSession(db, recipeId, 2, 'cook', stepIds[0], '2026-07-16T18:00:00.000Z');
    let session = await findUnfinishedSession(db, recipeId);

    // 90 seconds pass, then pause
    await pauseSession(db, session!, '2026-07-16T18:01:30.000Z');
    session = await findUnfinishedSession(db, recipeId);
    expect(session?.elapsedSeconds).toBe(90);
    expect(session?.pausedAt).not.toBeNull();
    expect(computeElapsedSeconds(session!, new Date('2026-07-16T18:10:00.000Z').getTime())).toBe(90); // frozen

    // resume, then 30 more seconds pass
    await resumeSession(db, session!, '2026-07-16T18:05:00.000Z');
    session = await findUnfinishedSession(db, recipeId);
    expect(session?.pausedAt).toBeNull();
    const elapsedAfterResume = computeElapsedSeconds(session!, new Date('2026-07-16T18:05:30.000Z').getTime());
    expect(elapsedAfterResume).toBe(120); // 90 frozen + 30 live

    expect(sessionId).toBeGreaterThan(0);
  });

  it('simulated kill-and-reopen: elapsed and current step survive a fresh read', async () => {
    const { recipeId, stepIds } = await insertRecipeWithSteps(db);
    await startSession(db, recipeId, 2, 'cook', stepIds[0], '2026-07-16T18:00:00.000Z');
    let session = await findUnfinishedSession(db, recipeId);
    await advanceToStep(db, session!, stepIds[1], '2026-07-16T18:05:00.000Z'); // 5 min into step 1

    // "kill and reopen" == just read fresh from the DB again with a new query
    const reopened = await findUnfinishedSession(db, recipeId);
    expect(reopened?.currentStepId).toBe(stepIds[1]);
    expect(reopened?.elapsedSeconds).toBe(300);

    const runtime = await loadStepRuntime(db, reopened!.id, reopened!.startedAt);
    expect(runtime.get(stepIds[0])?.actualStartOffsetSeconds).toBeUndefined(); // step 1 was the initial current step, never explicitly "advanced to"
    expect(runtime.get(stepIds[1])?.actualStartOffsetSeconds).toBe(300);
    expect(runtime.get(stepIds[1])?.completed).toBe(false);
  });

  it('completeStep marks a step done; finishSession removes the row entirely', async () => {
    const { recipeId, stepIds } = await insertRecipeWithSteps(db);
    await startSession(db, recipeId, 2, 'cook', stepIds[0]);
    const session = await findUnfinishedSession(db, recipeId);
    await advanceToStep(db, session!, stepIds[0]);
    await completeStep(db, session!.id, stepIds[0]);

    const runtime = await loadStepRuntime(db, session!.id, session!.startedAt);
    expect(runtime.get(stepIds[0])?.completed).toBe(true);

    await finishSession(db, session!.id);
    expect(await findUnfinishedSession(db, recipeId)).toBeNull();
  });
});
