// §5.6 lane projection — pure. Cooking Mode's lane tabs, per-lane timers, and
// auto-switching are all projections of the ONE master clock; nothing here is
// stored, so parallel cooking needed no migration. A lane's live step is
// simply its first uncompleted step.
import { effectiveStartOffset, type RecipeStepTiming, type StepRuntimeState } from './sessionClock';

export const MAIN_LANE_KEY = '__main__';
export const MAIN_LANE_NAME = 'Main';

export interface LaneStepInput {
  id: number;
  laneName: string | null;
}

export interface Lane {
  key: string;
  name: string;
  stepIds: number[];
}

/** Lanes in the order their first step appears (steps arrive in sort order).
 *  Steps with no lane fold into an implicit "Main" lane. */
export function buildLanes(steps: LaneStepInput[]): Lane[] {
  const byKey = new Map<string, Lane>();
  for (const step of steps) {
    const key = step.laneName ?? MAIN_LANE_KEY;
    const existing = byKey.get(key);
    if (existing) {
      existing.stepIds.push(step.id);
    } else {
      byKey.set(key, { key, name: step.laneName ?? MAIN_LANE_NAME, stepIds: [step.id] });
    }
  }
  return [...byKey.values()];
}

/** The tab strip is a feature of parallel cooking, not a tax on simple
 *  cooking — one lane means no tabs at all (§5.6). */
export function shouldShowLaneTabs(lanes: Lane[]): boolean {
  return lanes.length >= 2;
}

export type LaneState = 'running' | 'overdue' | 'done' | 'waiting';

export interface LaneStatus {
  key: string;
  name: string;
  /** First uncompleted step in the lane, or null when the lane is finished. */
  liveStepId: number | null;
  state: LaneState;
  /** Seconds remaining on a running step, or until a waiting step is due.
   *  Null when there is nothing to count (untimed step, or the lane is done). */
  seconds: number | null;
  completedCount: number;
  totalCount: number;
}

/** Per-lane timer + state, derived from the master clock. */
export function laneStatus(
  lane: Lane,
  timings: Map<number, RecipeStepTiming>,
  runtime: Map<number, StepRuntimeState>,
  elapsedSeconds: number,
  driftSeconds: number,
): LaneStatus {
  const completedCount = lane.stepIds.filter((id) => runtime.get(id)?.completed).length;
  const liveStepId = lane.stepIds.find((id) => !runtime.get(id)?.completed) ?? null;
  const base = {
    key: lane.key,
    name: lane.name,
    liveStepId,
    completedCount,
    totalCount: lane.stepIds.length,
  };

  if (liveStepId == null) return { ...base, state: 'done', seconds: null };

  const timing = timings.get(liveStepId);
  if (!timing) return { ...base, state: 'running', seconds: null };

  const start = effectiveStartOffset(timing, runtime.get(liveStepId), driftSeconds);
  if (start > elapsedSeconds) {
    return { ...base, state: 'waiting', seconds: Math.round(start - elapsedSeconds) };
  }
  if (timing.durationSeconds == null) {
    return { ...base, state: 'running', seconds: null };
  }
  const remaining = timing.durationSeconds - (elapsedSeconds - start);
  // A timer that ran out on a step nobody ticked off is the whole reason the
  // tabs exist: the rice is done and you are still stirring the curry.
  if (remaining <= 0) return { ...base, state: 'overdue', seconds: 0 };
  return { ...base, state: 'running', seconds: Math.round(remaining) };
}

export function laneStatuses(
  lanes: Lane[],
  timings: Map<number, RecipeStepTiming>,
  runtime: Map<number, StepRuntimeState>,
  elapsedSeconds: number,
  driftSeconds: number,
): LaneStatus[] {
  return lanes.map((lane) => laneStatus(lane, timings, runtime, elapsedSeconds, driftSeconds));
}

/** Which lane wants the cook right now: an expired timer first, then whichever
 *  running step is closest to ending. Null when nothing is asking. */
export function laneNeedingAttention(statuses: LaneStatus[]): string | null {
  const overdue = statuses.find((s) => s.state === 'overdue');
  if (overdue) return overdue.key;

  const running = statuses
    .filter((s) => s.state === 'running' && s.seconds != null)
    .sort((a, b) => (a.seconds as number) - (b.seconds as number));
  return running[0]?.key ?? null;
}

export interface VisibleLaneInput {
  statuses: LaneStatus[];
  /** The lane the cook selected by hand, if any — a pin (§5.6). */
  pinnedKey: string | null;
  /** What is on screen now. */
  currentKey: string;
  /** A lane that just fired a takeover-class alert (passive end / important).
   *  This is the ONE thing that overrides a pin. */
  takeoverLaneKey?: string | null;
}

export interface VisibleLaneResult {
  key: string;
  /** True when the pin must be dropped — only a takeover does this. */
  releasePin: boolean;
}

/** The app moves between lanes so the cook doesn't have to (§5.6), with one
 *  rule protecting deliberate navigation: a hand-picked lane is never pulled
 *  out from under you except by an alert you asked to be given. */
export function resolveVisibleLane({
  statuses,
  pinnedKey,
  currentKey,
  takeoverLaneKey = null,
}: VisibleLaneInput): VisibleLaneResult {
  const exists = (key: string | null) => key != null && statuses.some((s) => s.key === key);

  if (exists(takeoverLaneKey)) return { key: takeoverLaneKey as string, releasePin: true };
  if (exists(pinnedKey)) return { key: pinnedKey as string, releasePin: false };

  const attention = laneNeedingAttention(statuses);
  if (attention) return { key: attention, releasePin: false };

  // Nothing is asking: hold still rather than wander. A finished lane is the
  // one case worth leaving, and only for a lane that still has work.
  const current = statuses.find((s) => s.key === currentKey);
  if (current && current.state !== 'done') return { key: currentKey, releasePin: false };
  const unfinished = statuses.find((s) => s.state !== 'done');
  return { key: unfinished?.key ?? currentKey, releasePin: false };
}
