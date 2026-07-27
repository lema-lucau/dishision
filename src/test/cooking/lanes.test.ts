// §5.6 lane projection and attention resolution. These are the whole of the
// lane feature's logic — if they hold, the screen is just a view.
import { describe, expect, it } from 'vitest';
import {
  MAIN_LANE_KEY,
  buildLanes,
  laneNeedingAttention,
  laneStatus,
  laneStatuses,
  resolveVisibleLane,
  shouldShowLaneTabs,
  type Lane,
  type LaneStatus,
} from '../../cooking/lanes';
import type { RecipeStepTiming, StepRuntimeState } from '../../cooking/sessionClock';

function timing(id: number, offset: number, duration: number | null): RecipeStepTiming {
  return { id, scheduledStartOffsetSeconds: offset, durationSeconds: duration, effort: 'active', important: false };
}

function timings(...list: RecipeStepTiming[]): Map<number, RecipeStepTiming> {
  return new Map(list.map((t) => [t.id, t]));
}

function runtime(entries: Record<number, Partial<StepRuntimeState>> = {}): Map<number, StepRuntimeState> {
  return new Map(
    Object.entries(entries).map(([id, state]) => [
      Number(id),
      { actualStartOffsetSeconds: null, completed: false, ...state },
    ]),
  );
}

describe('buildLanes (§5.6)', () => {
  it('groups steps by lane in first-appearance order', () => {
    const lanes = buildLanes([
      { id: 1, laneName: 'Curry' },
      { id: 2, laneName: 'Rice' },
      { id: 3, laneName: 'Curry' },
    ]);
    expect(lanes.map((l) => l.name)).toEqual(['Curry', 'Rice']);
    expect(lanes[0].stepIds).toEqual([1, 3]);
    expect(lanes[1].stepIds).toEqual([2]);
  });

  it('folds unlaned steps into an implicit Main lane', () => {
    const lanes = buildLanes([
      { id: 1, laneName: null },
      { id: 2, laneName: null },
    ]);
    expect(lanes).toHaveLength(1);
    expect(lanes[0].key).toBe(MAIN_LANE_KEY);
    expect(lanes[0].name).toBe('Main');
  });

  it('keeps unlaned steps separate from named lanes rather than guessing', () => {
    const lanes = buildLanes([
      { id: 1, laneName: null },
      { id: 2, laneName: 'Rice' },
    ]);
    expect(lanes.map((l) => l.key)).toEqual([MAIN_LANE_KEY, 'Rice']);
  });

  it('shows tabs only for two or more lanes — simple cooking pays no tax', () => {
    expect(shouldShowLaneTabs(buildLanes([{ id: 1, laneName: null }]))).toBe(false);
    expect(shouldShowLaneTabs(buildLanes([{ id: 1, laneName: 'A' }, { id: 2, laneName: 'B' }]))).toBe(true);
  });

  it('handles a recipe with no steps at all', () => {
    expect(buildLanes([])).toEqual([]);
    expect(shouldShowLaneTabs([])).toBe(false);
  });
});

describe('laneStatus (§5.6 — the derived lane timer)', () => {
  const lane: Lane = { key: 'Rice', name: 'Rice', stepIds: [1, 2] };
  const t = timings(timing(1, 0, 120), timing(2, 120, 600));

  it('counts down the live step while it runs', () => {
    const status = laneStatus(lane, t, runtime(), 30, 0);
    expect(status.state).toBe('running');
    expect(status.seconds).toBe(90);
    expect(status.liveStepId).toBe(1);
  });

  it('counts down to a step that has not come due yet', () => {
    const laneLater: Lane = { key: 'Rice', name: 'Rice', stepIds: [2] };
    const status = laneStatus(laneLater, t, runtime(), 30, 0);
    expect(status.state).toBe('waiting');
    expect(status.seconds).toBe(90);
  });

  it('goes overdue when the timer ran out and nobody ticked the step off', () => {
    const status = laneStatus(lane, t, runtime(), 200, 0);
    expect(status.state).toBe('overdue');
    expect(status.seconds).toBe(0);
  });

  it('is done when every step is completed', () => {
    const status = laneStatus(lane, t, runtime({ 1: { completed: true }, 2: { completed: true } }), 900, 0);
    expect(status.state).toBe('done');
    expect(status.liveStepId).toBeNull();
    expect(status.completedCount).toBe(2);
  });

  it('runs without a countdown on an untimed step', () => {
    const untimed: Lane = { key: 'Salad', name: 'Salad', stepIds: [9] };
    const status = laneStatus(untimed, timings(timing(9, 0, null)), runtime(), 60, 0);
    expect(status.state).toBe('running');
    expect(status.seconds).toBeNull();
  });

  it('respects drift for unstarted steps and holds it for started ones', () => {
    const drifted = laneStatus({ key: 'R', name: 'R', stepIds: [2] }, t, runtime(), 120, 60);
    expect(drifted.state).toBe('waiting'); // pushed out by the drift
    expect(drifted.seconds).toBe(60);

    const started = laneStatus(
      { key: 'R', name: 'R', stepIds: [2] },
      t,
      runtime({ 2: { actualStartOffsetSeconds: 120 } }),
      180,
      60,
    );
    // A pot that started at 120s keeps its real end time regardless of drift.
    expect(started.state).toBe('running');
    expect(started.seconds).toBe(540);
  });

  it('reports progress counts for the tab label', () => {
    const status = laneStatus(lane, t, runtime({ 1: { completed: true } }), 200, 0);
    expect(status.completedCount).toBe(1);
    expect(status.totalCount).toBe(2);
    expect(status.liveStepId).toBe(2);
  });

  it('projects every lane at once', () => {
    const lanes = buildLanes([
      { id: 1, laneName: 'Curry' },
      { id: 2, laneName: 'Rice' },
    ]);
    const statuses = laneStatuses(lanes, timings(timing(1, 0, 120), timing(2, 0, 600)), runtime(), 30, 0);
    expect(statuses.map((s) => s.name)).toEqual(['Curry', 'Rice']);
    expect(statuses.map((s) => s.seconds)).toEqual([90, 570]);
  });
});

describe('attention + visible lane (§5.6 — the app moves, not the cook)', () => {
  const status = (key: string, state: LaneStatus['state'], seconds: number | null = null): LaneStatus => ({
    key,
    name: key,
    liveStepId: 1,
    state,
    seconds,
    completedCount: 0,
    totalCount: 2,
  });

  it('puts an expired timer ahead of everything', () => {
    const statuses = [status('Curry', 'running', 30), status('Rice', 'overdue', 0)];
    expect(laneNeedingAttention(statuses)).toBe('Rice');
  });

  it('otherwise picks whichever running step ends soonest', () => {
    const statuses = [status('Curry', 'running', 300), status('Rice', 'running', 40)];
    expect(laneNeedingAttention(statuses)).toBe('Rice');
  });

  it('asks for nothing when every lane is waiting or done', () => {
    expect(laneNeedingAttention([status('A', 'waiting', 60), status('B', 'done')])).toBeNull();
  });

  it('auto-switches to the lane that needs the cook', () => {
    const statuses = [status('Curry', 'running', 300), status('Rice', 'overdue', 0)];
    expect(resolveVisibleLane({ statuses, pinnedKey: null, currentKey: 'Curry' })).toEqual({
      key: 'Rice',
      releasePin: false,
    });
  });

  it('holds a pinned lane against an ordinary due step', () => {
    const statuses = [status('Curry', 'running', 300), status('Rice', 'overdue', 0)];
    expect(resolveVisibleLane({ statuses, pinnedKey: 'Curry', currentKey: 'Curry' })).toEqual({
      key: 'Curry',
      releasePin: false,
    });
  });

  it('yields a pinned lane to a takeover-class alert, and drops the pin', () => {
    const statuses = [status('Curry', 'running', 300), status('Rice', 'overdue', 0)];
    expect(
      resolveVisibleLane({ statuses, pinnedKey: 'Curry', currentKey: 'Curry', takeoverLaneKey: 'Rice' }),
    ).toEqual({ key: 'Rice', releasePin: true });
  });

  it('stays put when nothing is asking', () => {
    const statuses = [status('Curry', 'waiting', 90), status('Rice', 'waiting', 200)];
    expect(resolveVisibleLane({ statuses, pinnedKey: null, currentKey: 'Rice' }).key).toBe('Rice');
  });

  it('leaves a finished lane for one that still has work', () => {
    const statuses = [status('Curry', 'waiting', 90), status('Rice', 'done')];
    expect(resolveVisibleLane({ statuses, pinnedKey: null, currentKey: 'Rice' }).key).toBe('Curry');
  });

  it('ignores a pin or takeover naming a lane that no longer exists', () => {
    const statuses = [status('Curry', 'running', 30)];
    expect(resolveVisibleLane({ statuses, pinnedKey: 'Gone', currentKey: 'Curry' }).key).toBe('Curry');
    expect(resolveVisibleLane({ statuses, pinnedKey: null, currentKey: 'Curry', takeoverLaneKey: 'Gone' }).key).toBe(
      'Curry',
    );
  });
});
