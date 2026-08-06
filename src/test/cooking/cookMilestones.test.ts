import { describe, expect, it } from 'vitest';
import { celebrationLine, computeDayStreak, type CookMilestones } from '../../cooking/cookMilestones';

describe('computeDayStreak', () => {
  it('counts the cook day itself as a streak of 1 even with no prior cooks', () => {
    expect(computeDayStreak([], '2026-07-30')).toBe(1);
  });

  it('extends back over consecutive days', () => {
    expect(computeDayStreak(['2026-07-29', '2026-07-28'], '2026-07-30')).toBe(3);
  });

  it('stops at the first gap', () => {
    // 29th present, 28th missing → streak is today + 29th = 2.
    expect(computeDayStreak(['2026-07-29', '2026-07-27'], '2026-07-30')).toBe(2);
  });

  it('ignores days after the cook day', () => {
    expect(computeDayStreak(['2026-07-31', '2026-07-29'], '2026-07-30')).toBe(2);
  });

  it('is not thrown by the cook day already appearing in the set', () => {
    expect(computeDayStreak(['2026-07-30', '2026-07-29'], '2026-07-30')).toBe(2);
  });
});

function milestones(overrides: Partial<CookMilestones> = {}): CookMilestones {
  return {
    timesCooked: 3,
    dayStreak: 1,
    cooksThisMonth: 3,
    bestStarsThisMonth: null,
    firstTime: false,
    ...overrides,
  };
}

describe('celebrationLine', () => {
  it('leads with the first cook', () => {
    expect(celebrationLine(milestones({ firstTime: true, timesCooked: 1 }), 5)).toMatch(/first time/i);
  });

  it('celebrates round tens', () => {
    expect(celebrationLine(milestones({ timesCooked: 10 }), null)).toContain('10 times');
  });

  it('celebrates a streak of three or more', () => {
    expect(celebrationLine(milestones({ dayStreak: 4 }), null)).toContain('4 days');
  });

  it('celebrates a joint-best rating this month', () => {
    expect(celebrationLine(milestones({ bestStarsThisMonth: 4 }), 5)).toMatch(/best-rated/i);
  });

  it('does not claim a best when a higher one already exists this month', () => {
    expect(celebrationLine(milestones({ bestStarsThisMonth: 5 }), 4)).toBeNull();
  });

  it('says nothing for an unremarkable cook', () => {
    expect(celebrationLine(milestones({ timesCooked: 3, dayStreak: 1 }), null)).toBeNull();
  });
});
