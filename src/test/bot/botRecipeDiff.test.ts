import { describe, expect, it } from 'vitest';
import { applyBotDiff, buildBotDiff } from '../../bot/botRecipeDiff';
import type { RecipeDraft, RecipeStepDraft } from '../../recipes/recipeSave';

function step(instruction: string, extra: Partial<RecipeStepDraft> = {}): RecipeStepDraft {
  return { phase: 'cook', instruction, effort: 'active', important: false, ...extra };
}

function draft(overrides: Partial<RecipeDraft> = {}): RecipeDraft {
  return {
    name: 'Curry',
    description: 'Weeknight staple.',
    photoUri: null,
    photoEmoji: '🍛',
    baseServings: 2,
    timelineMode: 'sequential',
    originLabel: '',
    lanes: [],
    ingredients: [
      { canonicalId: 1, displayName: 'Chicken thigh', quantity: 300, unit: 'g', scalable: true, optional: false },
      { canonicalId: 2, displayName: 'Onion', quantity: 1, unit: 'unit', scalable: true, optional: false },
    ],
    steps: [step('Brown the chicken.'), step('Add onion.')],
    tags: [],
    ...overrides,
  };
}

describe('buildBotDiff (§9)', () => {
  it('returns no changes for identical drafts', () => {
    expect(buildBotDiff(draft(), draft())).toEqual([]);
  });

  it('flags a recipe-level field change', () => {
    const changes = buildBotDiff(draft(), draft({ name: 'Coconut Curry' }));
    expect(changes).toHaveLength(1);
    expect(changes[0].id).toBe('field:name');
    expect(changes[0].newText).toBe('Coconut Curry');
  });

  it('flags ingredient add / remove / modify by key', () => {
    const next = draft({
      ingredients: [
        { canonicalId: 1, displayName: 'Chicken thigh', quantity: 400, unit: 'g', scalable: true, optional: false }, // modified qty
        { canonicalId: 3, displayName: 'Garlic', quantity: 2, unit: 'unit', scalable: true, optional: false }, // added
        // Onion removed
      ],
    });
    const changes = buildBotDiff(draft(), next);
    const byType = changes.filter((c) => c.group === 'ingredient').map((c) => c.changeType).sort();
    expect(byType).toEqual(['added', 'modified', 'removed']);
  });

  it('shows a single reorder toggle when only step order changed', () => {
    const next = draft({ steps: [step('Add onion.'), step('Brown the chicken.')] });
    const changes = buildBotDiff(draft(), next);
    expect(changes).toHaveLength(1);
    expect(changes[0].group).toBe('reorder');
    expect(changes[0].section).toBe('Main');
  });

  it('flags a reworded step as a per-step modified row', () => {
    const next = draft({ steps: [step('Sear the chicken hard.'), step('Add onion.')] });
    const changes = buildBotDiff(draft(), next);
    const stepChanges = changes.filter((c) => c.group === 'step');
    expect(stepChanges).toHaveLength(1);
    expect(stepChanges[0].changeType).toBe('modified');
  });
});

describe('applyBotDiff (§9 merge)', () => {
  it('accepting nothing reproduces the base draft', () => {
    const next = draft({ name: 'X', ingredients: [], steps: [step('totally different')] });
    const merged = applyBotDiff(draft(), next, new Set());
    expect(merged.name).toBe('Curry');
    expect(merged.ingredients).toHaveLength(2);
    expect(merged.steps.map((s) => s.instruction)).toEqual(['Brown the chicken.', 'Add onion.']);
  });

  it('accepting a field change takes the new value only', () => {
    const next = draft({ name: 'Coconut Curry', baseServings: 4 });
    const merged = applyBotDiff(draft(), next, new Set(['field:name']));
    expect(merged.name).toBe('Coconut Curry');
    expect(merged.baseServings).toBe(2); // servings change not accepted
  });

  it('accepting an ingredient addition includes it; rejecting a removal keeps it', () => {
    const next = draft({
      ingredients: [
        { canonicalId: 1, displayName: 'Chicken thigh', quantity: 300, unit: 'g', scalable: true, optional: false },
        { canonicalId: 3, displayName: 'Garlic', quantity: 2, unit: 'unit', scalable: true, optional: false },
        // Onion removed in next
      ],
    });
    // Accept the Garlic addition, reject the Onion removal.
    const merged = applyBotDiff(draft(), next, new Set(['ing:c:3']));
    const names = merged.ingredients.map((i) => i.displayName).sort();
    expect(names).toEqual(['Chicken thigh', 'Garlic', 'Onion']);
  });

  it('accepting a reorder toggle reorders the lane', () => {
    const next = draft({ steps: [step('Add onion.'), step('Brown the chicken.')] });
    const merged = applyBotDiff(draft(), next, new Set(['reorder:Main']));
    expect(merged.steps.map((s) => s.instruction)).toEqual(['Add onion.', 'Brown the chicken.']);
  });

  it('reconciles to parallel when accepted steps introduce lanes', () => {
    const next = draft({
      timelineMode: 'parallel',
      lanes: ['Rice', 'Curry'],
      steps: [step('Cook rice.', { lane: 'Rice' }), step('Simmer curry.', { lane: 'Curry' })],
    });
    const accepted = new Set(['step:Main:0', 'step:Main:1', 'reorder:Main']);
    // Accept every step change — the base "Main" steps are replaced by lane steps.
    const merged = applyBotDiff(draft(), next, buildAllIds(draft(), next));
    expect(merged.timelineMode).toBe('parallel');
    expect(merged.lanes.sort()).toEqual(['Curry', 'Rice']);
    void accepted;
  });
});

function buildAllIds(base: RecipeDraft, next: RecipeDraft): Set<string> {
  return new Set(buildBotDiff(base, next).map((c) => c.id));
}
