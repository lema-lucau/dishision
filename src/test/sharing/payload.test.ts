import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { createUserIngredient } from '../../recipes/ingredientSearch';
import { createManualRecipe, type RecipeDraft } from '../../recipes/recipeSave';
import {
  buildSharePayload,
  parseSharePayload,
  PayloadValidationError,
  PAYLOAD_VERSION,
  serializeSharePayload,
} from '../../sharing/payload';
import { createTestDb } from '../support/testDb';

function baseDraft(overrides: Partial<RecipeDraft> = {}): RecipeDraft {
  return {
    name: 'Thai Green Curry',
    description: 'Weeknight staple.',
    photoEmoji: '🍛',
    baseServings: 2,
    timelineMode: 'parallel',
    originLabel: "Nana's recipe",
    lanes: ['Rice', 'Curry'],
    ingredients: [],
    steps: [],
    tags: ['chicken', 'thai'],
    ...overrides,
  };
}

describe('share payload (§7.1)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('round-trips a full recipe through build -> serialize -> parse', async () => {
    const chicken = await createUserIngredient(db, 'Chicken thigh', 'g');
    const recipeId = await createManualRecipe(
      db,
      baseDraft({
        ingredients: [
          { canonicalId: chicken.id, displayName: 'Chicken thigh', quantity: 400, unit: 'g', scalable: true, optional: false },
          { canonicalId: null, displayName: 'A pinch of salt', quantity: 1, unit: 'unit', scalable: false, optional: true },
        ],
        steps: [
          {
            lane: 'Rice',
            phase: 'cook',
            instruction: 'Boil the rice',
            durationSeconds: 720,
            startOffsetSeconds: 0,
            effort: 'passive',
            important: false,
          },
          {
            lane: 'Curry',
            phase: 'cook',
            instruction: 'Fry the curry paste',
            durationSeconds: 120,
            startOffsetSeconds: 60,
            effort: 'active',
            important: true,
          },
        ],
      }),
    );

    const payload = await buildSharePayload(db, recipeId);
    expect(payload.v).toBe(PAYLOAD_VERSION);

    const json = serializeSharePayload(payload);
    const parsed = parseSharePayload(json);

    expect(parsed).toEqual(payload);
    expect(parsed.recipe.name).toBe('Thai Green Curry');
    expect(parsed.recipe.photo).toBeNull();
    expect(parsed.ingredients).toHaveLength(2);
    expect(parsed.ingredients[0].canonical_name).toBe('Chicken thigh');
    // Unresolved ingredient falls back to its display name as canonical_name.
    expect(parsed.ingredients[1].canonical_name).toBe('A pinch of salt');
    expect(parsed.steps).toHaveLength(2);
    expect(parsed.steps[0].lane).toBe('Rice');
    expect(parsed.tags).toEqual(['Chicken', 'Thai']);
  });

  it('never includes ratings, logs, favourites, plans, or pantry state', async () => {
    const recipeId = await createManualRecipe(db, baseDraft());
    const payload = await buildSharePayload(db, recipeId);
    const json = serializeSharePayload(payload);
    expect(json).not.toContain('stars');
    expect(json).not.toContain('pantry');
    expect(json).not.toContain('favourite');
    expect(json).not.toContain('planned');
  });

  it('includes the photo only when explicitly opted in, via the injected reader', async () => {
    const recipeId = await createManualRecipe(db, baseDraft());
    await db.runAsync('UPDATE recipe SET photo_uri = ? WHERE id = ?', ['file:///fake.jpg', recipeId]);

    const withoutPhoto = await buildSharePayload(db, recipeId, { includePhoto: false });
    expect(withoutPhoto.recipe.photo).toBeNull();

    const withPhoto = await buildSharePayload(db, recipeId, {
      includePhoto: true,
      readPhotoAsBase64: async (uri) => `base64(${uri})`,
    });
    expect(withPhoto.recipe.photo).toBe('base64(file:///fake.jpg)');
  });

  it('rejects a payload with an unsupported version', () => {
    const json = JSON.stringify({ v: 2, share_id: 'x', recipe: { name: 'x' }, ingredients: [], steps: [] });
    expect(() => parseSharePayload(json)).toThrow(PayloadValidationError);
  });

  it('rejects malformed JSON and missing required fields', () => {
    expect(() => parseSharePayload('{not json')).toThrow(PayloadValidationError);
    expect(() => parseSharePayload(JSON.stringify({ v: 1 }))).toThrow(PayloadValidationError);
    expect(() =>
      parseSharePayload(JSON.stringify({ v: 1, share_id: 'x', recipe: { name: 'x' }, ingredients: 'nope', steps: [] })),
    ).toThrow(PayloadValidationError);
  });
});
