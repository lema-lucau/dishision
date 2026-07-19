import { describe, expect, it } from 'vitest';
import {
  computeDriftSeconds,
  computeElapsedSeconds,
  computeEtaSeconds,
  computeNotificationSchedule,
  deriveCurrentStepId,
  effectiveStartOffset,
  isSessionStale,
  type RecipeStepTiming,
  type StepRuntimeState,
} from '../../cooking/sessionClock';

describe('computeElapsedSeconds (§5.6, §2.3 write cadence)', () => {
  it('freezes at the checkpoint while paused', () => {
    const session = { elapsedSeconds: 120, updatedAt: '2026-07-16T18:00:00.000Z', pausedAt: '2026-07-16T18:00:00.000Z' };
    const now = new Date('2026-07-16T18:05:00.000Z').getTime();
    expect(computeElapsedSeconds(session, now)).toBe(120);
  });

  it('projects forward from the checkpoint while running', () => {
    const session = { elapsedSeconds: 120, updatedAt: '2026-07-16T18:00:00.000Z', pausedAt: null };
    const now = new Date('2026-07-16T18:01:30.000Z').getTime(); // +90s
    expect(computeElapsedSeconds(session, now)).toBe(210);
  });
});

describe('isSessionStale (§5.6 12-hour staleness)', () => {
  it('is not stale just under 12 hours', () => {
    const session = { updatedAt: '2026-07-16T06:00:01.000Z' };
    const now = new Date('2026-07-16T18:00:00.000Z').getTime();
    expect(isSessionStale(session, now)).toBe(false);
  });

  it('is stale just over 12 hours', () => {
    const session = { updatedAt: '2026-07-16T05:59:00.000Z' };
    const now = new Date('2026-07-16T18:00:00.000Z').getTime();
    expect(isSessionStale(session, now)).toBe(true);
  });
});

function step(overrides: Partial<RecipeStepTiming> = {}): RecipeStepTiming {
  return {
    id: 1,
    scheduledStartOffsetSeconds: 0,
    durationSeconds: 300,
    effort: 'active',
    important: false,
    ...overrides,
  };
}

describe('effectiveStartOffset (§5.6 drift: unstarted shifts, running holds)', () => {
  it('shifts an unstarted step forward by drift', () => {
    const s = step({ scheduledStartOffsetSeconds: 600 });
    expect(effectiveStartOffset(s, undefined, 50)).toBe(650);
  });

  it('a started step holds its real start regardless of drift', () => {
    const s = step({ scheduledStartOffsetSeconds: 600 });
    const runtime: StepRuntimeState = { actualStartOffsetSeconds: 640, completed: false };
    expect(effectiveStartOffset(s, runtime, 50)).toBe(640);
  });
});

describe('computeDriftSeconds', () => {
  it('is positive when running behind schedule', () => {
    const s = step({ scheduledStartOffsetSeconds: 300 });
    expect(computeDriftSeconds(s, 350)).toBe(50);
  });

  it('is zero or negative when on time or ahead', () => {
    const s = step({ scheduledStartOffsetSeconds: 300 });
    expect(computeDriftSeconds(s, 300)).toBe(0);
    expect(computeDriftSeconds(s, 250)).toBe(-50);
  });
});

describe('computeEtaSeconds', () => {
  it('adds positive drift to the total, ignores negative drift', () => {
    expect(computeEtaSeconds(1800, 60)).toBe(1860);
    expect(computeEtaSeconds(1800, -60)).toBe(1800);
  });
});

describe('computeNotificationSchedule (§5.6, §11.2)', () => {
  const steps: RecipeStepTiming[] = [
    step({ id: 1, scheduledStartOffsetSeconds: 0, durationSeconds: 300, effort: 'active' }),
    step({ id: 2, scheduledStartOffsetSeconds: 300, durationSeconds: 600, effort: 'passive' }),
    step({ id: 3, scheduledStartOffsetSeconds: 900, durationSeconds: 120, effort: 'active', important: true }),
  ];

  it('pausing yields no live notifications', () => {
    expect(computeNotificationSchedule(steps, new Map(), 0, true)).toEqual([]);
  });

  it('schedules passive and important timed steps, ignoring plain active ones', () => {
    const result = computeNotificationSchedule(steps, new Map(), 0, false);
    expect(result.map((r) => r.stepId).sort()).toEqual([2, 3]);
  });

  it('shifts only unstarted steps when drift is applied', () => {
    const runtime = new Map([[2, { actualStartOffsetSeconds: 320, completed: false }]]);
    const result = computeNotificationSchedule(steps, runtime, 50, false);
    const step2 = result.find((r) => r.stepId === 2)!;
    const step3 = result.find((r) => r.stepId === 3)!;
    // step 2 already started at 320 -> fires at 320+600=920, drift ignored
    expect(step2.fireAtOffsetSeconds).toBe(920);
    // step 3 hasn't started -> scheduled(900)+drift(50)+duration(120)
    expect(step3.fireAtOffsetSeconds).toBe(1070);
  });

  it('drops completed steps from the schedule', () => {
    const runtime = new Map([[2, { actualStartOffsetSeconds: 300, completed: true }]]);
    const result = computeNotificationSchedule(steps, runtime, 0, false);
    expect(result.map((r) => r.stepId)).toEqual([3]);
  });
});

describe('deriveCurrentStepId (master clock auto-advance, sequential)', () => {
  const steps: RecipeStepTiming[] = [
    step({ id: 1, scheduledStartOffsetSeconds: 0 }),
    step({ id: 2, scheduledStartOffsetSeconds: 300 }),
    step({ id: 3, scheduledStartOffsetSeconds: 900 }),
  ];

  it('picks the last step whose start has arrived', () => {
    expect(deriveCurrentStepId(steps, new Map(), 0, 0)).toBe(1);
    expect(deriveCurrentStepId(steps, new Map(), 0, 301)).toBe(2);
    expect(deriveCurrentStepId(steps, new Map(), 0, 950)).toBe(3);
  });
});
