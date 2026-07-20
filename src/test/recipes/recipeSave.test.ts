import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { createManualRecipe, updateManualRecipe, type RecipeDraft } from '../../recipes/recipeSave';
import { createTestDb } from '../support/testDb';

function baseDraft(overrides: Partial<RecipeDraft> = {}): RecipeDraft {
  return {
    name: 'Weeknight Chilli',
    description: 'Quick and cheap.',
    photoEmoji: '🌶️',
    baseServings: 2,
    timelineMode: 'sequential',
    originLabel: '',
    lanes: [],
    ingredients: [],
    steps: [],
    tags: [],
    ...overrides,
  };
}

describe('createManualRecipe / updateManualRecipe (§5.5)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('creates a recipe with source=manual and no seed_id', async () => {
    const id = await createManualRecipe(db, baseDraft());
    const row = await db.getFirstAsync<{ source: string; seed_id: string | null; name: string }>(
      'SELECT source, seed_id, name FROM recipe WHERE id = ?',
      [id],
    );
    expect(row?.source).toBe('manual');
    expect(row?.seed_id).toBeNull();
    expect(row?.name).toBe('Weeknight Chilli');
  });

  it('writes ingredients, steps, lanes and tags, resolving or creating tags by name', async () => {
    const id = await createManualRecipe(
      db,
      baseDraft({
        timelineMode: 'parallel',
        lanes: ['Rice', 'Chilli'],
        ingredients: [
          { canonicalId: null, displayName: 'Kidney beans', quantity: 400, unit: 'g', scalable: true, optional: false },
        ],
        steps: [
          { lane: 'Rice', phase: 'cook', instruction: 'Boil rice', durationSeconds: 600, startOffsetSeconds: 0, effort: 'passive', important: false },
        ],
        tags: ['beef', 'one-pot'],
      }),
    );

    const ingredients = await db.getAllAsync<{ display_name: string }>('SELECT display_name FROM recipe_ingredient WHERE recipe_id = ?', [id]);
    expect(ingredients).toHaveLength(1);
    expect(ingredients[0].display_name).toBe('Kidney beans');

    const steps = await db.getAllAsync<{ instruction: string; lane_id: number | null }>('SELECT instruction, lane_id FROM recipe_step WHERE recipe_id = ?', [id]);
    expect(steps).toHaveLength(1);
    expect(steps[0].lane_id).not.toBeNull();

    const tags = await db.getAllAsync<{ name: string }>(
      `SELECT t.name FROM recipe_tag rt JOIN tag t ON t.id = rt.tag_id WHERE rt.recipe_id = ? ORDER BY t.name`,
      [id],
    );
    expect(tags.map((t) => t.name)).toEqual(['Beef', 'One-pot']);
  });

  it('update replaces children rather than accumulating duplicates', async () => {
    const id = await createManualRecipe(
      db,
      baseDraft({
        ingredients: [{ canonicalId: null, displayName: 'Onion', quantity: 1, unit: 'unit', scalable: true, optional: false }],
      }),
    );

    await updateManualRecipe(
      db,
      id,
      baseDraft({
        name: 'Weeknight Chilli (updated)',
        ingredients: [
          { canonicalId: null, displayName: 'Onion', quantity: 1, unit: 'unit', scalable: true, optional: false },
          { canonicalId: null, displayName: 'Garlic', quantity: 2, unit: 'unit', scalable: true, optional: false },
        ],
      }),
    );

    const row = await db.getFirstAsync<{ name: string }>('SELECT name FROM recipe WHERE id = ?', [id]);
    expect(row?.name).toBe('Weeknight Chilli (updated)');

    const ingredients = await db.getAllAsync<{ display_name: string }>('SELECT display_name FROM recipe_ingredient WHERE recipe_id = ?', [id]);
    expect(ingredients).toHaveLength(2);
  });

  it('a failed save rolls back rather than leaving a half-written recipe', async () => {
    const badDraft = baseDraft({
      // canonicalId 999 doesn't exist — with foreign_keys=ON (§2.6) this
      // violates recipe_ingredient's FK and must abort the whole transaction.
      ingredients: [{ canonicalId: 999, displayName: 'Ghost ingredient', quantity: 1, unit: 'unit', scalable: true, optional: false }],
    });

    await expect(createManualRecipe(db, badDraft)).rejects.toThrow();

    const count = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM recipe');
    expect(count?.c).toBe(0);
  });
});
