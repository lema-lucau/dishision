// §5.6 Cooking Mode clock maths — all pure, all testable without a timer or
// a database. The engine reads a `cooking_session` checkpoint (elapsed
// seconds + the instant it was taken) and projects "elapsed now" from it;
// nothing here ticks on its own.
import type { Effort } from '../seed/types';

export interface SessionCheckpoint {
  elapsedSeconds: number;
  /** ISO timestamp the checkpoint above was taken. */
  updatedAt: string;
  /** Non-null only while paused. */
  pausedAt: string | null;
}

// Elapsed time is derived, not ticked (§2.3 write cadence comment): while
// running it's the checkpoint plus real time since the checkpoint; while
// paused it's frozen at the checkpoint.
export function computeElapsedSeconds(session: SessionCheckpoint, nowMs: number): number {
  if (session.pausedAt != null) return session.elapsedSeconds;
  const sinceCheckpoint = (nowMs - new Date(session.updatedAt).getTime()) / 1000;
  return session.elapsedSeconds + Math.max(0, sinceCheckpoint);
}

// 12-hour staleness (§5.6 entry): past this, only "Start over" is offered.
export function isSessionStale(session: { updatedAt: string }, nowMs: number, staleHours = 12): boolean {
  const ageMs = nowMs - new Date(session.updatedAt).getTime();
  return ageMs > staleHours * 60 * 60 * 1000;
}

export interface RecipeStepTiming {
  id: number;
  /** Authored (parallel) or derived-at-read-time (sequential) offset, before any drift. */
  scheduledStartOffsetSeconds: number;
  durationSeconds: number | null;
  effort: Effort;
  important: boolean;
}

export interface StepRuntimeState {
  /** Elapsed-seconds position the step actually started at, or null if it hasn't started yet. */
  actualStartOffsetSeconds: number | null;
  completed: boolean;
}

// Drift shifts the ETA and every UNSTARTED step forward. A step that has
// already started keeps the real start it actually got — the pot that's
// been simmering for 12 minutes doesn't care that you're behind (§5.6).
export function effectiveStartOffset(
  step: RecipeStepTiming,
  runtime: StepRuntimeState | undefined,
  driftSeconds: number,
): number {
  if (runtime?.actualStartOffsetSeconds != null) return runtime.actualStartOffsetSeconds;
  return step.scheduledStartOffsetSeconds + driftSeconds;
}

// Drift is measured against whichever step the cook is actually looking at:
// how far the real elapsed time has landed from that step's schedule.
// Positive = behind, negative = ahead (manual back-navigation).
export function computeDriftSeconds(currentStep: RecipeStepTiming, elapsedSeconds: number): number {
  return elapsedSeconds - currentStep.scheduledStartOffsetSeconds;
}

export function computeEtaSeconds(totalScheduledSeconds: number, driftSeconds: number): number {
  return totalScheduledSeconds + Math.max(0, driftSeconds);
}

export interface ScheduledNotification {
  stepId: number;
  /** Elapsed-seconds position (from session start) the step's timer ends at. */
  fireAtOffsetSeconds: number;
}

// §5.6: the full desired notification set "right now" — recomputed (never
// incrementally patched) on every pause/resume/advance/drift/complete, so
// the side-effecting layer can just diff against what's currently scheduled
// and cancel/reschedule the difference. Paused -> nothing should be live.
// Completed steps are dropped (their timer already ended for real).
export function computeNotificationSchedule(
  steps: RecipeStepTiming[],
  runtime: Map<number, StepRuntimeState>,
  driftSeconds: number,
  paused: boolean,
): ScheduledNotification[] {
  if (paused) return [];
  return steps
    .filter((s) => s.durationSeconds != null && (s.effort === 'passive' || s.important))
    .filter((s) => !(runtime.get(s.id)?.completed ?? false))
    .map((s) => ({
      stepId: s.id,
      fireAtOffsetSeconds: effectiveStartOffset(s, runtime.get(s.id), driftSeconds) + (s.durationSeconds as number),
    }));
}

// Master-clock auto-advance for a sequential timeline: the current step is
// the last one whose (drift-shifted, for unstarted steps) start has already
// arrived. Manual ←/→ overrides this at any time (§5.6) — this is only the
// automatic projection, called when nothing has manually overridden it.
export function deriveCurrentStepId(
  steps: RecipeStepTiming[],
  runtime: Map<number, StepRuntimeState>,
  driftSeconds: number,
  elapsedSeconds: number,
): number | null {
  let currentId: number | null = null;
  for (const step of steps) {
    const start = effectiveStartOffset(step, runtime.get(step.id), driftSeconds);
    if (start <= elapsedSeconds) currentId = step.id;
    else break;
  }
  return currentId ?? steps[0]?.id ?? null;
}
