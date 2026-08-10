import { describe, expect, it } from 'vitest';
import { parseMealPlan } from '../../bot/proposeMealPlanTool';

describe('parseMealPlan (§A2.5 / batch-2 E — ordered cooks)', () => {
  it('keeps well-formed cooks referencing existing recipes or naming new ones', () => {
    const plan = parseMealPlan({
      cooks: [
        { existing_recipe_id: 7, reasoning: 'a favourite, not cooked lately' },
        { new_recipe_name: 'Lemon Orzo', reasoning: 'something new and light' },
      ],
      notes: 'balanced week',
    });
    expect(plan?.cooks).toHaveLength(2);
    expect(plan?.cooks[0]).toMatchObject({ existing_recipe_id: 7, new_recipe_name: null });
    expect(plan?.cooks[1]).toMatchObject({ existing_recipe_id: null, new_recipe_name: 'Lemon Orzo' });
    expect(plan?.notes).toBe('balanced week');
  });

  it('preserves the order of the cooks', () => {
    const plan = parseMealPlan({
      cooks: [{ existing_recipe_id: 3 }, { existing_recipe_id: 1 }, { existing_recipe_id: 2 }],
    });
    expect(plan?.cooks.map((c) => c.existing_recipe_id)).toEqual([3, 1, 2]);
  });

  it('drops cooks that point nowhere', () => {
    const plan = parseMealPlan({
      cooks: [
        {}, // no id, no name → dropped
        { reasoning: 'still nothing' }, // dropped
        { existing_recipe_id: 5 },
      ],
    });
    expect(plan?.cooks).toHaveLength(1);
    expect(plan?.cooks[0].existing_recipe_id).toBe(5);
  });

  it('returns null for malformed input or an all-empty plan', () => {
    expect(parseMealPlan(null)).toBeNull();
    expect(parseMealPlan({})).toBeNull();
    expect(parseMealPlan({ cooks: [] })).toBeNull();
    expect(parseMealPlan({ cooks: [{}] })).toBeNull();
  });
});
