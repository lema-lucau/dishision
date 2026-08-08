import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { createChat, getChat } from '../../bot/chatRepo';
import { saveBotRecipe } from '../../bot/botSave';
import { DEFAULT_BOT_SETTINGS } from '../../bot/types';
import { loadRecipeDraft } from '../../recipes/loadRecipeForEdit';
import { createManualRecipe, type RecipeDraft } from '../../recipes/recipeSave';
import { createTestDb } from '../support/testDb';

const settings = { ...DEFAULT_BOT_SETTINGS };

function draft(overrides: Partial<RecipeDraft> = {}): RecipeDraft {
  return {
    name: 'Miso Soup',
    description: '',
    photoUri: null,
    photoEmoji: '🍲',
    baseServings: 2,
    timelineMode: 'sequential',
    originLabel: '',
    lanes: [],
    ingredients: [{ canonicalId: null, displayName: 'Miso paste', quantity: 2, unit: 'tbsp', scalable: true, optional: false }],
    steps: [{ phase: 'cook', instruction: 'Whisk miso into dashi.', effort: 'active', important: false }],
    tags: [],
    ...overrides,
  };
}

describe('saveBotRecipe (§11)', () => {
  let db: DbClient;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it('creates a new recipe from a from-scratch chat and links the chat to it', async () => {
    const chat = await createChat(db, { source: 'chat', settings });
    const recipeId = await saveBotRecipe(db, { draft: draft(), chat, mode: 'new', dishisionAssisted: false });
    const row = await db.getFirstAsync<{ name: string; origin_label: string | null }>('SELECT name, origin_label FROM recipe WHERE id = ?', [recipeId]);
    expect(row?.name).toBe('Miso Soup');
    expect(row?.origin_label).toBeNull();
    const reloaded = await getChat(db, chat.id);
    expect(reloaded?.savedRecipeId).toBe(recipeId);
  });

  it('stamps origin_label (and origin_url for links) when marked Dishision Assisted', async () => {
    const chat = await createChat(db, { source: 'link', settings, sourceUrl: 'https://example.com/curry' });
    const recipeId = await saveBotRecipe(db, { draft: draft(), chat, mode: 'new', dishisionAssisted: true });
    const row = await db.getFirstAsync<{ origin_label: string | null; origin_url: string | null }>(
      'SELECT origin_label, origin_url FROM recipe WHERE id = ?',
      [recipeId],
    );
    expect(row?.origin_label).toBe('Dishision Assisted');
    expect(row?.origin_url).toBe('https://example.com/curry');
  });

  it('overwrites an existing recipe in place, preserving its id (and cook log)', async () => {
    const originalId = await createManualRecipe(db, draft({ name: 'Old Name' }));
    await db.runAsync(
      `INSERT INTO cook_log (recipe_id, cooked_at, servings_made) VALUES (?, '2026-08-01T18:00:00Z', 2)`,
      [originalId],
    );
    const chat = await createChat(db, { source: 'existing_recipe', settings, originalRecipeId: originalId });

    const refined = draft({ name: 'New Name', baseServings: 4 });
    const savedId = await saveBotRecipe(db, { draft: refined, chat, mode: 'overwrite', dishisionAssisted: false });
    expect(savedId).toBe(originalId); // same id

    const reloaded = await loadRecipeDraft(db, originalId);
    expect(reloaded.name).toBe('New Name');
    expect(reloaded.baseServings).toBe(4);
    // Cook log keyed off the id survives the overwrite.
    const logs = await db.getAllAsync('SELECT id FROM cook_log WHERE recipe_id = ?', [originalId]);
    expect(logs).toHaveLength(1);
  });

  it('save-as-new leaves the original recipe untouched', async () => {
    const originalId = await createManualRecipe(db, draft({ name: 'Original' }));
    const chat = await createChat(db, { source: 'existing_recipe', settings, originalRecipeId: originalId });
    const newId = await saveBotRecipe(db, { draft: draft({ name: 'Forked' }), chat, mode: 'new', dishisionAssisted: false });
    expect(newId).not.toBe(originalId);
    const original = await loadRecipeDraft(db, originalId);
    expect(original.name).toBe('Original');
  });
});
