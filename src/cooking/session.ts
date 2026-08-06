// §5.6/§2.3 cooking_session persistence. Writes happen on EVENTS ONLY —
// start, pause, resume, step advance, drift recalculation, app background —
// never on a per-second tick (§2.3 write cadence comment, §15).
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { recipeName } from '../debug/logNames';
import { computeElapsedSeconds, type SessionCheckpoint, type StepRuntimeState } from './sessionClock';

export interface CookingSessionRow {
  id: number;
  recipeId: number;
  servings: number;
  phase: 'prep' | 'cook';
  startedAt: string;
  elapsedSeconds: number;
  pausedAt: string | null;
  driftSeconds: number;
  currentStepId: number | null;
  updatedAt: string;
}

function mapRow(row: {
  id: number;
  recipe_id: number;
  servings: number;
  phase: string;
  started_at: string;
  elapsed_seconds: number;
  paused_at: string | null;
  drift_seconds: number;
  current_step_id: number | null;
  updated_at: string;
}): CookingSessionRow {
  return {
    id: row.id,
    recipeId: row.recipe_id,
    servings: row.servings,
    phase: row.phase as 'prep' | 'cook',
    startedAt: row.started_at,
    elapsedSeconds: row.elapsed_seconds,
    pausedAt: row.paused_at,
    driftSeconds: row.drift_seconds,
    currentStepId: row.current_step_id,
    updatedAt: row.updated_at,
  };
}

// A recipe has at most one live session at a time in this app (no
// multi-recipe Cooking Mode sessions, §1.2) — but sessions aren't deleted on
// their own, only on explicit start-over or Complete, so this looks up
// whatever's still sitting there for this recipe.
export async function findUnfinishedSession(db: DbClient, recipeId: number): Promise<CookingSessionRow | null> {
  const row = await db.getFirstAsync<Parameters<typeof mapRow>[0]>(
    'SELECT * FROM cooking_session WHERE recipe_id = ? ORDER BY updated_at DESC LIMIT 1',
    [recipeId],
  );
  return row ? mapRow(row) : null;
}

export async function startSession(
  db: DbClient,
  recipeId: number,
  servings: number,
  phase: 'prep' | 'cook',
  currentStepId: number | null,
  now: string = new Date().toISOString(),
  // §5.6 ready state: the clock does not start on entry. A ready session IS a
  // paused session, which is why persistence, resume, and "pause cancels all
  // notifications" all apply to it for free.
  ready = false,
): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO cooking_session (recipe_id, servings, phase, started_at, elapsed_seconds, paused_at, drift_seconds, current_step_id, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, 0, ?, ?)`,
    [recipeId, servings, phase, now, ready ? now : null, currentStepId, now],
  );
  logger.info('engine', 'Cooking session started', { recipeId, recipeName: await recipeName(db, recipeId), sessionId: result.lastInsertRowId, ready });
  return result.lastInsertRowId;
}

/** A session sitting in the ready state (§5.6): created, paused, nothing
 *  elapsed. Killing the app here and reopening must land back here, never
 *  mid-cook. */
export function isReadySession(session: CookingSessionRow): boolean {
  return session.pausedAt != null && session.elapsedSeconds === 0;
}

/** Ready → running. Rebases the session onto the instant the cook actually
 *  tapped Start, so the minutes spent reading the first step never leak into
 *  elapsed time or into a step's recorded start offset. */
export async function beginClock(
  db: DbClient,
  session: CookingSessionRow,
  now: string = new Date().toISOString(),
): Promise<void> {
  await db.runAsync(
    'UPDATE cooking_session SET started_at = ?, elapsed_seconds = 0, paused_at = NULL, updated_at = ? WHERE id = ?',
    [now, now, session.id],
  );
  // The first step was marked started when the ready session was built; its
  // start is the same instant the clock now begins at.
  await db.runAsync('UPDATE cooking_session_step SET started_at = ? WHERE session_id = ? AND completed_at IS NULL', [
    now,
    session.id,
  ]);
  logger.info('engine', 'Cooking clock started', { sessionId: session.id });
}

// "Start over" replaces rather than resumes — the old session is simply gone.
export async function abandonSession(db: DbClient, sessionId: number): Promise<void> {
  await db.runAsync('DELETE FROM cooking_session WHERE id = ?', [sessionId]);
}

async function checkpoint(db: DbClient, session: CookingSessionRow, now: string): Promise<number> {
  const elapsed = computeElapsedSeconds(session, new Date(now).getTime());
  await db.runAsync('UPDATE cooking_session SET elapsed_seconds = ?, updated_at = ? WHERE id = ?', [
    elapsed,
    now,
    session.id,
  ]);
  return elapsed;
}

export async function pauseSession(db: DbClient, session: CookingSessionRow, now: string = new Date().toISOString()): Promise<void> {
  const elapsed = computeElapsedSeconds(session, new Date(now).getTime());
  await db.runAsync('UPDATE cooking_session SET elapsed_seconds = ?, paused_at = ?, updated_at = ? WHERE id = ?', [
    elapsed,
    now,
    now,
    session.id,
  ]);
}

export async function resumeSession(db: DbClient, session: CookingSessionRow, now: string = new Date().toISOString()): Promise<void> {
  // Checkpoint first (freezes elapsed at the pause-to-resume gap, which is
  // zero movement since paused_at froze it already) then clear paused_at.
  await db.runAsync('UPDATE cooking_session SET paused_at = NULL, updated_at = ? WHERE id = ?', [now, session.id]);
}

export async function advanceToStep(
  db: DbClient,
  session: CookingSessionRow,
  stepId: number,
  now: string = new Date().toISOString(),
): Promise<void> {
  await checkpoint(db, session, now);
  await db.runAsync('UPDATE cooking_session SET current_step_id = ?, updated_at = ? WHERE id = ?', [stepId, now, session.id]);
  await db.runAsync('INSERT OR IGNORE INTO cooking_session_step (session_id, step_id, started_at) VALUES (?, ?, ?)', [
    session.id,
    stepId,
    now,
  ]);
}

export async function completeStep(
  db: DbClient,
  sessionId: number,
  stepId: number,
  now: string = new Date().toISOString(),
): Promise<void> {
  await db.runAsync('UPDATE cooking_session_step SET completed_at = ? WHERE session_id = ? AND step_id = ?', [
    now,
    sessionId,
    stepId,
  ]);
}

export async function updateDrift(
  db: DbClient,
  session: CookingSessionRow,
  driftSeconds: number,
  now: string = new Date().toISOString(),
): Promise<void> {
  await checkpoint(db, session, now);
  await db.runAsync('UPDATE cooking_session SET drift_seconds = ?, updated_at = ? WHERE id = ?', [
    driftSeconds,
    now,
    session.id,
  ]);
}

// App-background / screen-exit event (§5.6 write cadence list) — freezes
// the current elapsed time without changing anything else about the
// session, so a resumed session's clock is exactly where it should be.
export async function checkpointSession(db: DbClient, session: CookingSessionRow, now: string = new Date().toISOString()): Promise<void> {
  await checkpoint(db, session, now);
}

export async function setPhase(
  db: DbClient,
  session: CookingSessionRow,
  phase: 'prep' | 'cook',
  now: string = new Date().toISOString(),
): Promise<void> {
  await checkpoint(db, session, now);
  await db.runAsync('UPDATE cooking_session SET phase = ?, updated_at = ? WHERE id = ?', [phase, now, session.id]);
}

// Complete or exit cancels every outstanding notification (handled by the
// caller against the notification schedule) and removes the session row —
// there's nothing to resume once a cook is done.
export async function finishSession(db: DbClient, sessionId: number): Promise<void> {
  await db.runAsync('DELETE FROM cooking_session WHERE id = ?', [sessionId]);
}

export async function loadStepRuntime(db: DbClient, sessionId: number, sessionStartedAt: string): Promise<Map<number, StepRuntimeState>> {
  const rows = await db.getAllAsync<{ step_id: number; started_at: string | null; completed_at: string | null }>(
    'SELECT step_id, started_at, completed_at FROM cooking_session_step WHERE session_id = ?',
    [sessionId],
  );
  const startedAtMs = new Date(sessionStartedAt).getTime();
  const map = new Map<number, StepRuntimeState>();
  for (const row of rows) {
    map.set(row.step_id, {
      actualStartOffsetSeconds: row.started_at ? (new Date(row.started_at).getTime() - startedAtMs) / 1000 : null,
      completed: row.completed_at != null,
    });
  }
  return map;
}

export type { SessionCheckpoint };
