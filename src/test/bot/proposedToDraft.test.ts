import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import {
  baseUnitForRecipeUnit,
  draftToProposed,
  normalizeUnit,
  proposedToDraft,
  resolveDraftIngredients,
} from '../../bot/proposedToDraft';
import type { ProposedRecipe } from '../../bot/types';
import { createTestDb } from '../support/testDb';

function proposed(overrides: Partial<ProposedRecipe> = {}): ProposedRecipe {
  return {
    name: 'Tomato Pasta',
    ingredients: [{ display_name: 'spaghetti', quantity: 200, unit: 'g' }],
    lanes: [{ name: 'Main', steps: [{ instruction: 'Boil pasta.', duration_seconds: 600, effort: 'low' }] }],
    ...overrides,
  };
}

describe('proposedToDraft (§7.2 → RecipeDraft)', () => {
  it('maps a single-lane proposal to a sequential recipe with no lanes', () => {
    const draft = proposedToDraft(proposed());
    expect(draft.timelineMode).toBe('sequential');
    expect(draft.lanes).toEqual([]);
    expect(draft.steps).toHaveLength(1);
    expect(draft.steps[0].lane).toBeUndefined();
    // low effort → passive
    expect(draft.steps[0].effort).toBe('passive');
    expect(draft.steps[0].durationSeconds).toBe(600);
  });

  it('maps multiple real lanes to a parallel recipe with per-lane offsets', () => {
    const draft = proposedToDraft(
      proposed({
        lanes: [
          { name: 'Sauce', steps: [{ instruction: 'Simmer sauce.', duration_seconds: 300 }, { instruction: 'Season.', duration_seconds: 60 }] },
          { name: 'Pasta', steps: [{ instruction: 'Boil pasta.', duration_seconds: 600 }] },
        ],
      }),
    );
    expect(draft.timelineMode).toBe('parallel');
    expect(draft.lanes).toEqual(['Sauce', 'Pasta']);
    // Offsets are a running sum WITHIN each lane, reset per lane.
    const sauce = draft.steps.filter((s) => s.lane === 'Sauce');
    expect(sauce[0].startOffsetSeconds).toBe(0);
    expect(sauce[1].startOffsetSeconds).toBe(300);
    const pasta = draft.steps.filter((s) => s.lane === 'Pasta');
    expect(pasta[0].startOffsetSeconds).toBe(0);
  });

  it('defaults name/servings/emoji and coerces bad values', () => {
    const draft = proposedToDraft({ name: '  Soup ', ingredients: [], lanes: [], base_servings: 0 } as ProposedRecipe);
    expect(draft.name).toBe('Soup');
    expect(draft.baseServings).toBe(2); // 0 rejected → default
    expect(draft.photoEmoji).toBe('🍽️');
  });

  it('maps effort medium/high to active, low to passive', () => {
    const draft = proposedToDraft(
      proposed({
        lanes: [{ name: 'Main', steps: [
          { instruction: 'a', effort: 'high' },
          { instruction: 'b', effort: 'medium' },
          { instruction: 'c', effort: 'low' },
        ] }],
      }),
    );
    expect(draft.steps.map((s) => s.effort)).toEqual(['active', 'active', 'passive']);
  });

  it('infers prep vs cook from the phase text', () => {
    const draft = proposedToDraft(
      proposed({ lanes: [{ name: 'Main', steps: [
        { instruction: 'Chop onion', phase: 'prep' },
        { instruction: 'Fry', phase: 'cooking' },
      ] }] }),
    );
    expect(draft.steps[0].phase).toBe('prep');
    expect(draft.steps[1].phase).toBe('cook');
  });
});

describe('normalizeUnit', () => {
  it('passes through valid recipe units', () => {
    expect(normalizeUnit('g')).toBe('g');
    expect(normalizeUnit('tbsp')).toBe('tbsp');
  });
  it('normalises synonyms and unknowns', () => {
    expect(normalizeUnit('grams')).toBe('g');
    expect(normalizeUnit('Tablespoon')).toBe('tbsp');
    expect(normalizeUnit('cloves')).toBe('unit');
    expect(normalizeUnit(undefined)).toBe('unit');
    expect(normalizeUnit('nonsense')).toBe('unit');
  });
});

describe('baseUnitForRecipeUnit', () => {
  it('maps volume→ml, weight→g, else unit', () => {
    expect(baseUnitForRecipeUnit('tsp')).toBe('ml');
    expect(baseUnitForRecipeUnit('kg')).toBe('g');
    expect(baseUnitForRecipeUnit('unit')).toBe('unit');
  });
});

describe('draftToProposed round-trip', () => {
  it('re-groups a sequential draft under a single Main lane', () => {
    const draft = proposedToDraft(proposed());
    const back = draftToProposed(draft);
    expect(back.lanes).toHaveLength(1);
    expect(back.lanes[0].name).toBe('Main');
    expect(back.lanes[0].steps).toHaveLength(1);
  });
});

describe('resolveDraftIngredients (§6 matching + auto-create)', () => {
  let db: DbClient;
  beforeEach(async () => {
    db = await createTestDb();
    await db.runAsync(`INSERT INTO canonical_ingredient (name, base_unit, source) VALUES ('Spaghetti', 'g', 'seed')`);
    await db.runAsync(`INSERT INTO canonical_ingredient (name, base_unit, source) VALUES ('Scallion', 'unit', 'seed')`);
    await db.runAsync(
      `INSERT INTO canonical_ingredient_alias (canonical_id, alias) VALUES ((SELECT id FROM canonical_ingredient WHERE name='Scallion'), 'spring onion')`,
    );
  });

  it('attaches canonical_id for an exact name match', async () => {
    const { ingredients, newIngredientNames } = await resolveDraftIngredients(db, [
      { canonicalId: null, displayName: 'spaghetti', quantity: 200, unit: 'g', scalable: true, optional: false },
    ]);
    expect(ingredients[0].canonicalId).not.toBeNull();
    expect(newIngredientNames.size).toBe(0);
  });

  it('attaches via alias match', async () => {
    const { ingredients, newIngredientNames } = await resolveDraftIngredients(db, [
      { canonicalId: null, displayName: 'spring onion', quantity: 2, unit: 'unit', scalable: true, optional: false },
    ]);
    expect(ingredients[0].canonicalId).not.toBeNull();
    expect(newIngredientNames.size).toBe(0);
  });

  it('matches a prep-suffixed name to the existing plain ingredient without a new row (§B5)', async () => {
    const { ingredients, newIngredientNames } = await resolveDraftIngredients(db, [
      // "spring onion, sliced" -> strips to "spring onion" -> alias match on Scallion.
      { canonicalId: null, displayName: 'spring onion, sliced', quantity: 2, unit: 'unit', scalable: true, optional: false },
    ]);
    expect(ingredients[0].canonicalId).not.toBeNull();
    expect(newIngredientNames.size).toBe(0);
    // The on-screen display name keeps its prep detail; only the match key was stripped.
    expect(ingredients[0].displayName).toBe('spring onion, sliced');
    // No duplicate canonical row was created.
    const count = (await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM canonical_ingredient'))!.c;
    expect(count).toBe(2);
  });

  it('auto-creates on the stripped name, not the descriptor form (§B5)', async () => {
    const { ingredients } = await resolveDraftIngredients(db, [
      { canonicalId: null, displayName: 'shallot, finely diced', quantity: 1, unit: 'unit', scalable: true, optional: false },
    ]);
    expect(ingredients[0].canonicalId).not.toBeNull();
    // The new canonical row is the plain ingredient (capitalised by createUserIngredient),
    // NOT the descriptor form "shallot, finely diced".
    const row = await db.getFirstAsync<{ name: string }>(`SELECT name FROM canonical_ingredient WHERE LOWER(name) = 'shallot'`);
    expect(row?.name).toBe('Shallot');
  });

  it('auto-creates and flags an unmatched ingredient', async () => {
    const { ingredients, newIngredientNames } = await resolveDraftIngredients(db, [
      { canonicalId: null, displayName: 'Gochujang', quantity: 1, unit: 'tbsp', scalable: true, optional: false },
    ]);
    expect(ingredients[0].canonicalId).not.toBeNull();
    expect(newIngredientNames.has('gochujang')).toBe(true);
    const row = await db.getFirstAsync<{ base_unit: string; source: string }>(
      `SELECT base_unit, source FROM canonical_ingredient WHERE name = 'Gochujang'`,
    );
    expect(row?.source).toBe('user');
    expect(row?.base_unit).toBe('ml'); // tbsp → volume base
  });
});
