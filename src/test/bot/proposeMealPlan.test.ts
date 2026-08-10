import { describe, expect, it } from 'vitest';
import { parseMealPlan } from '../../bot/proposeMealPlanTool';

describe('parseMealPlan (§A2.5)', () => {
  it('keeps well-formed days referencing existing recipes or naming new ones', () => {
    const plan = parseMealPlan({
      days: [
        { date: '2026-06-01', existing_recipe_id: 7, reasoning: 'uses up leftovers' },
        { date: '2026-06-02', new_recipe_name: 'Lemon Orzo', reasoning: 'something new and light' },
      ],
      notes: 'balanced week',
    });
    expect(plan?.days).toHaveLength(2);
    expect(plan?.days[0]).toMatchObject({ date: '2026-06-01', existing_recipe_id: 7, new_recipe_name: null });
    expect(plan?.days[1]).toMatchObject({ date: '2026-06-02', existing_recipe_id: null, new_recipe_name: 'Lemon Orzo' });
    expect(plan?.notes).toBe('balanced week');
  });

  it('drops days that point nowhere or lack a date', () => {
    const plan = parseMealPlan({
      days: [
        { date: '2026-06-01' }, // no recipe → dropped
        { existing_recipe_id: 3 }, // no date → dropped
        { date: '2026-06-03', existing_recipe_id: 5 },
      ],
    });
    expect(plan?.days).toHaveLength(1);
    expect(plan?.days[0].existing_recipe_id).toBe(5);
  });

  it('returns null for malformed input or an all-empty plan', () => {
    expect(parseMealPlan(null)).toBeNull();
    expect(parseMealPlan({})).toBeNull();
    expect(parseMealPlan({ days: [] })).toBeNull();
    expect(parseMealPlan({ days: [{ date: '2026-06-01' }] })).toBeNull();
  });

  it('normalises an ISO datetime to a plain date', () => {
    const plan = parseMealPlan({ days: [{ date: '2026-06-01T00:00:00Z', existing_recipe_id: 1 }] });
    expect(plan?.days[0].date).toBe('2026-06-01');
  });

  it('accepts a leftover day pointing at its source recipe, with no new cook (§J)', () => {
    const plan = parseMealPlan({
      days: [
        { date: '2026-06-01', existing_recipe_id: 7, reasoning: 'batch cook' },
        { date: '2026-06-02', is_leftover: true, existing_recipe_id: 7, reasoning: 'leftovers from Monday' },
      ],
    });
    expect(plan?.days).toHaveLength(2);
    expect(plan?.days[0]).toMatchObject({ isLeftover: false });
    expect(plan?.days[1]).toMatchObject({ isLeftover: true, existing_recipe_id: 7, new_recipe_name: null });
  });

  it('drops a leftover day that names no source recipe', () => {
    const plan = parseMealPlan({
      days: [
        { date: '2026-06-02', is_leftover: true, reasoning: 'leftovers but of what?' },
        { date: '2026-06-03', existing_recipe_id: 5 },
      ],
    });
    expect(plan?.days).toHaveLength(1);
    expect(plan?.days[0].date).toBe('2026-06-03');
  });

  it('ignores a new recipe name on a leftover day', () => {
    const plan = parseMealPlan({
      days: [{ date: '2026-06-02', is_leftover: true, existing_recipe_id: 4, new_recipe_name: 'Should be ignored' }],
    });
    expect(plan?.days[0]).toMatchObject({ isLeftover: true, existing_recipe_id: 4, new_recipe_name: null });
  });
});
