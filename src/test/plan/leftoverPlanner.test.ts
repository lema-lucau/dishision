import { describe, expect, it } from 'vitest';
import { layoutLeftoverPlan, mealsCovered, type PlannerCook } from '../../plan/leftoverPlanner';

// A tiny cook factory whose servings we control per-recipe id.
const cook = (id: number): PlannerCook => ({ existing_recipe_id: id });

function layout(cooks: PlannerCook[], spanDays: number, servings: Record<number, number>, householdSize = 2) {
  return layoutLeftoverPlan({
    cooks,
    startDate: '2026-08-10', // a Monday
    spanDays,
    householdSize,
    servingsOf: (c) => servings[c.existing_recipe_id ?? -1] ?? 0,
  });
}

describe('mealsCovered', () => {
  it('is servings ÷ household, floored, at least 1', () => {
    expect(mealsCovered(4, 2)).toBe(2);
    expect(mealsCovered(6, 2)).toBe(3);
    expect(mealsCovered(2, 2)).toBe(1);
    expect(mealsCovered(1, 2)).toBe(1); // never below 1
    expect(mealsCovered(5, 2)).toBe(2); // floor(2.5)
  });
});

describe('layoutLeftoverPlan (§E)', () => {
  it('2-serving recipes cook every day, no leftovers', () => {
    const days = layout([cook(1), cook(2), cook(3)], 3, { 1: 2, 2: 2, 3: 2 });
    expect(days.map((d) => d.kind)).toEqual(['cook', 'cook', 'cook']);
    expect(days.map((d) => d.date)).toEqual(['2026-08-10', '2026-08-11', '2026-08-12']);
  });

  it('a 4-serving / household-2 cook covers its day + 1 leftover', () => {
    const days = layout([cook(1), cook(2)], 4, { 1: 4, 2: 4 });
    expect(days.map((d) => d.kind)).toEqual(['cook', 'leftover', 'cook', 'leftover']);
    // The leftover points back at the cook it came from.
    expect(days[1]).toMatchObject({ kind: 'leftover', sourceCook: cook(1) });
    expect(days[2]).toMatchObject({ kind: 'cook', cook: cook(2) });
  });

  it('a 6-serving cook covers its day + 2 leftovers', () => {
    const days = layout([cook(1)], 3, { 1: 6 });
    expect(days.map((d) => d.kind)).toEqual(['cook', 'leftover', 'leftover']);
  });

  it('truncates a leftover tail at the span end', () => {
    // 6 servings = 3 meals, but only 2 days of span remain.
    const days = layout([cook(1)], 2, { 1: 6 });
    expect(days.map((d) => d.kind)).toEqual(['cook', 'leftover']);
    expect(days).toHaveLength(2);
  });

  it('leaves trailing days empty when the cooks run out', () => {
    // One 2-serving cook, span of 3 → only day 1 filled.
    const days = layout([cook(1)], 3, { 1: 2 });
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ kind: 'cook' });
  });

  it('backfills a gap day — the Mon/Wed/Fri example', () => {
    // 4-serving cooks: cook Mon → Tue leftover → cook Wed → Thu leftover → cook Fri.
    const days = layout([cook(1), cook(2), cook(3)], 5, { 1: 4, 2: 4, 3: 4 });
    expect(days.map((d) => `${d.date}:${d.kind}`)).toEqual([
      '2026-08-10:cook',
      '2026-08-11:leftover',
      '2026-08-12:cook',
      '2026-08-13:leftover',
      '2026-08-14:cook',
    ]);
  });

  it('respects household size in coverage', () => {
    // 4 servings across a household of 4 = 1 meal → cooks daily.
    const days = layout([cook(1), cook(2)], 2, { 1: 4, 2: 4 }, 4);
    expect(days.map((d) => d.kind)).toEqual(['cook', 'cook']);
  });
});
