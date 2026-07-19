import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import {
  createSubstitution,
  deleteSubstitution,
  loadRecipeIngredientOptions,
  loadSubstitutionsForLog,
  promoteSubstitution,
  updateSubstitution,
  type SubstitutionDraft,
} from '../../cooking/substitutions';
import { createTestDb } from '../support/testDb';

async function insertRecipe(db: DbClient, name = 'Curry'): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO recipe (share_id, name, photo_emoji, base_servings, timeline_mode, source) VALUES (?, ?, '🍛', 2, 'sequential', 'manual')`,
    [`share-${name}`, name],
  );
  return result.lastInsertRowId;
}

async function insertIngredient(db: DbClient, recipeId: number, displayName: string): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO recipe_ingredient (recipe_id, display_name, quantity, unit) VALUES (?, ?, 100, 'g')`,
    [recipeId, displayName],
  );
  return result.lastInsertRowId;
}

async function insertCookLog(db: DbClient, recipeId: number, cookedAt = '2026-07-16T18:00:00.000Z'): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO cook_log (recipe_id, cooked_at, servings_made, servings_eaten, stars) VALUES (?, ?, 2, 2, 4)`,
    [recipeId, cookedAt],
  );
  return result.lastInsertRowId;
}

function draft(overrides: Partial<SubstitutionDraft> = {}): SubstitutionDraft {
  return {
    cookLogId: 1,
    originalIngredientId: null,
    originalText: 'chicken thigh',
    replacementText: 'tofu',
    verdict: 'better',
    ...overrides,
  };
}

describe('cook_log_substitution CRUD (§5.9)', () => {
  let db: DbClient;
  let recipeId: number;
  let ingredientId: number;
  let cookLogId: number;

  beforeEach(async () => {
    db = await createTestDb();
    recipeId = await insertRecipe(db);
    ingredientId = await insertIngredient(db, recipeId, 'chicken thigh');
    cookLogId = await insertCookLog(db, recipeId);
  });

  it('creates and loads a substitution for a log', async () => {
    const id = await createSubstitution(db, draft({ cookLogId, originalIngredientId: ingredientId }));
    const rows = await loadSubstitutionsForLog(db, cookLogId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id,
      cookLogId,
      originalIngredientId: ingredientId,
      originalText: 'chicken thigh',
      replacementText: 'tofu',
      verdict: 'better',
      promoted: false,
    });
  });

  it('updates a non-promoted substitution', async () => {
    const id = await createSubstitution(db, draft({ cookLogId }));
    await updateSubstitution(db, id, {
      originalIngredientId: null,
      originalText: 'chicken thigh',
      replacementText: 'seitan',
      verdict: 'worse',
    });
    const [row] = await loadSubstitutionsForLog(db, cookLogId);
    expect(row.replacementText).toBe('seitan');
    expect(row.verdict).toBe('worse');
  });

  it('deletes a substitution', async () => {
    const id = await createSubstitution(db, draft({ cookLogId }));
    await deleteSubstitution(db, id);
    expect(await loadSubstitutionsForLog(db, cookLogId)).toHaveLength(0);
  });

  it('lists a recipe’s ingredients for the "which ingredient" picker', async () => {
    const options = await loadRecipeIngredientOptions(db, recipeId);
    expect(options).toEqual([{ id: ingredientId, displayName: 'chicken thigh' }]);
  });

  describe('promoteSubstitution', () => {
    it('rewrites recipe_ingredient.display_name and marks promoted, but never touches original_text (§5.9)', async () => {
      const id = await createSubstitution(db, draft({ cookLogId, originalIngredientId: ingredientId }));

      const result = await promoteSubstitution(db, id);
      expect(result).toEqual({ ok: true });

      const ingredient = await db.getFirstAsync<{ display_name: string }>(
        'SELECT display_name FROM recipe_ingredient WHERE id = ?',
        [ingredientId],
      );
      expect(ingredient?.display_name).toBe('tofu');

      const [row] = await loadSubstitutionsForLog(db, cookLogId);
      expect(row.promoted).toBe(true);
      expect(row.originalText).toBe('chicken thigh'); // snapshot, unchanged by promotion
    });

    it('fails without promoting when original_ingredient_id is null (free-text substitution)', async () => {
      const id = await createSubstitution(db, draft({ cookLogId, originalIngredientId: null }));
      const result = await promoteSubstitution(db, id);
      expect(result).toEqual({ ok: false, reason: 'no_ingredient' });
      const [row] = await loadSubstitutionsForLog(db, cookLogId);
      expect(row.promoted).toBe(false);
    });

    it('fails without promoting when the referenced ingredient was deleted since the sub was logged', async () => {
      const id = await createSubstitution(db, draft({ cookLogId, originalIngredientId: ingredientId }));
      await db.runAsync('DELETE FROM recipe_ingredient WHERE id = ?', [ingredientId]);

      // ON DELETE SET NULL — the FK column itself goes null.
      const result = await promoteSubstitution(db, id);
      expect(result).toEqual({ ok: false, reason: 'no_ingredient' });
      const [row] = await loadSubstitutionsForLog(db, cookLogId);
      expect(row.promoted).toBe(false);
      expect(row.originalIngredientId).toBeNull();
    });

    it('a second, older cook log’s own substitution snapshot is unaffected by another log’s promotion', async () => {
      const olderLogId = await insertCookLog(db, recipeId, '2026-01-01T18:00:00.000Z');
      const olderSubId = await createSubstitution(
        db,
        draft({ cookLogId: olderLogId, originalIngredientId: ingredientId, replacementText: 'lentils' }),
      );

      const newerSubId = await createSubstitution(db, draft({ cookLogId, originalIngredientId: ingredientId, replacementText: 'tofu' }));
      const result = await promoteSubstitution(db, newerSubId);
      expect(result).toEqual({ ok: true });

      const [olderRow] = await loadSubstitutionsForLog(db, olderLogId);
      expect(olderRow.id).toBe(olderSubId);
      expect(olderRow.originalText).toBe('chicken thigh');
      expect(olderRow.replacementText).toBe('lentils');
      expect(olderRow.promoted).toBe(false);
    });
  });
});
