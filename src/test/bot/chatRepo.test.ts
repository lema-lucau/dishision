import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import {
  appendMessage,
  createChat,
  deleteChat,
  getChat,
  getMessages,
  listChatSummaries,
  MAX_CHATS,
  setSavedRecipe,
  updateChatSettings,
  updateDraft,
} from '../../bot/chatRepo';
import { DEFAULT_BOT_SETTINGS, type ProposedRecipe } from '../../bot/types';
import { createTestDb } from '../support/testDb';

const settings = { ...DEFAULT_BOT_SETTINGS };

const sampleRecipe: ProposedRecipe = {
  name: 'Miso Soup',
  ingredients: [{ display_name: 'miso paste', quantity: 2, unit: 'tbsp' }],
  lanes: [{ name: 'Main', steps: [{ instruction: 'Whisk miso into dashi.' }] }],
};

async function insertRecipe(db: DbClient): Promise<number> {
  const r = await db.runAsync(
    `INSERT INTO recipe (share_id, name, photo_emoji, base_servings, timeline_mode, source) VALUES ('s1', 'X', '🍽️', 2, 'sequential', 'manual')`,
  );
  return r.lastInsertRowId;
}

describe('chatRepo (§4)', () => {
  let db: DbClient;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it('creates a chat and snapshots the settings', async () => {
    const chat = await createChat(db, { source: 'chat', settings });
    expect(chat.source).toBe('chat');
    expect(chat.settings.model).toBe(settings.model);
    expect(chat.draft).toBeNull();
  });

  it('persists messages and the recipe draft continuously', async () => {
    const chat = await createChat(db, { source: 'paste_text', settings });
    await appendMessage(db, chat.id, 'user', 'here is a recipe');
    await appendMessage(db, chat.id, 'assistant', 'got it');
    await updateDraft(db, chat.id, sampleRecipe);

    const messages = await getMessages(db, chat.id);
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    const reloaded = await getChat(db, chat.id);
    expect(reloaded?.draft?.name).toBe('Miso Soup');
  });

  it('lists summaries most-recent-first with the last message snippet', async () => {
    const a = await createChat(db, { source: 'chat', settings });
    await appendMessage(db, a.id, 'user', 'first chat');
    const b = await createChat(db, { source: 'chat', settings });
    await appendMessage(db, b.id, 'user', 'second chat message');
    await updateDraft(db, b.id, sampleRecipe);

    const summaries = await listChatSummaries(db);
    expect(summaries[0].id).toBe(b.id); // most recently updated first
    expect(summaries[0].name).toBe('Miso Soup');
    expect(summaries[0].snippet).toContain('second chat');
  });

  it('enforces the 50-chat cap by evicting the oldest', async () => {
    const first = await createChat(db, { source: 'chat', settings });
    // Fill to the cap (we already have 1).
    for (let i = 1; i < MAX_CHATS; i++) {
      await createChat(db, { source: 'chat', settings });
    }
    let count = (await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM bot_chat'))!.c;
    expect(count).toBe(MAX_CHATS);

    // The 51st evicts exactly one, and it's the oldest (first).
    await createChat(db, { source: 'chat', settings });
    count = (await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM bot_chat'))!.c;
    expect(count).toBe(MAX_CHATS);
    expect(await getChat(db, first.id)).toBeNull();
  });

  it('deleting a chat cascades its messages but leaves a saved recipe intact', async () => {
    const recipeId = await insertRecipe(db);
    const chat = await createChat(db, { source: 'chat', settings });
    await appendMessage(db, chat.id, 'user', 'hi');
    await setSavedRecipe(db, chat.id, recipeId);

    await deleteChat(db, chat.id);
    expect(await getChat(db, chat.id)).toBeNull();
    const msgs = await db.getAllAsync('SELECT * FROM bot_chat_message WHERE chat_id = ?', [chat.id]);
    expect(msgs).toHaveLength(0);
    // Recipe survives.
    const recipe = await db.getFirstAsync('SELECT id FROM recipe WHERE id = ?', [recipeId]);
    expect(recipe).not.toBeNull();
  });

  it('nulls saved_recipe_id when the recipe is deleted (never cascades the chat)', async () => {
    const recipeId = await insertRecipe(db);
    const chat = await createChat(db, { source: 'existing_recipe', settings, originalRecipeId: recipeId });
    await setSavedRecipe(db, chat.id, recipeId);
    await db.runAsync('DELETE FROM recipe WHERE id = ?', [recipeId]);
    const reloaded = await getChat(db, chat.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded?.savedRecipeId).toBeNull();
    expect(reloaded?.originalRecipeId).toBeNull();
  });

  it('per-chat settings override updates the snapshot', async () => {
    const chat = await createChat(db, { source: 'chat', settings });
    await updateChatSettings(db, chat.id, { ...settings, model: 'sonnet', laneAggressiveness: 'aggressive' });
    const reloaded = await getChat(db, chat.id);
    expect(reloaded?.settings.model).toBe('sonnet');
    expect(reloaded?.settings.laneAggressiveness).toBe('aggressive');
  });
});
