// §4: chat lifecycle & storage. Every message and every recipe-candidate
// update is written to disk immediately (persisted continuously) so an app
// crash mid-conversation loses nothing. Up to 50 chats are retained; creating a
// 51st permanently evicts the least-recently-updated one. Evicting or deleting
// a chat never touches a recipe it already produced (the FKs are ON DELETE SET
// NULL, migration 007).
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { uuidv4 } from '../utils/uuid';
import { DEFAULT_BOT_SETTINGS, type BotBehaviourSettings, type BotChat, type BotChatSource, type BotMessage, type BotMessageRole, type ProposedRecipe } from './types';

export const MAX_CHATS = 50;

interface ChatRow {
  id: string;
  created_at: string;
  updated_at: string;
  source: string;
  source_url: string | null;
  original_recipe_id: number | null;
  recipe_draft_json: string | null;
  saved_recipe_id: number | null;
  model_used: string | null;
  lane_aggressiveness: string | null; // full settings snapshot JSON (§5.1)
  dishision_assisted: number;
}

function parseSettings(json: string | null): BotBehaviourSettings {
  if (!json) return { ...DEFAULT_BOT_SETTINGS };
  try {
    return { ...DEFAULT_BOT_SETTINGS, ...(JSON.parse(json) as Partial<BotBehaviourSettings>) };
  } catch {
    return { ...DEFAULT_BOT_SETTINGS };
  }
}

function parseDraft(json: string | null): ProposedRecipe | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as ProposedRecipe;
  } catch {
    return null;
  }
}

function mapChat(row: ChatRow): BotChat {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: row.source as BotChatSource,
    sourceUrl: row.source_url,
    originalRecipeId: row.original_recipe_id,
    draft: parseDraft(row.recipe_draft_json),
    savedRecipeId: row.saved_recipe_id,
    model: row.model_used,
    settings: parseSettings(row.lane_aggressiveness),
    dishisionAssisted: row.dishision_assisted === 1,
  };
}

export interface CreateChatInput {
  source: BotChatSource;
  settings: BotBehaviourSettings;
  sourceUrl?: string | null;
  originalRecipeId?: number | null;
  draft?: ProposedRecipe | null;
}

// Enforce the 50-chat cap by evicting the least-recently-updated chats until
// there's room for one more.
async function enforceCap(db: DbClient): Promise<void> {
  const { count } = (await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM bot_chat')) ?? { count: 0 };
  if (count < MAX_CHATS) return;
  const toEvict = count - MAX_CHATS + 1;
  const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM bot_chat ORDER BY updated_at ASC LIMIT ?', [toEvict]);
  for (const r of rows) {
    await db.runAsync('DELETE FROM bot_chat WHERE id = ?', [r.id]);
  }
  if (rows.length > 0) logger.info('ui', 'Dishision Bot: evicted oldest chat(s) at 50-chat cap', { count: rows.length });
}

export async function createChat(db: DbClient, input: CreateChatInput): Promise<BotChat> {
  await enforceCap(db);
  const id = uuidv4();
  await db.runAsync(
    `INSERT INTO bot_chat (id, source, source_url, original_recipe_id, recipe_draft_json, model_used, lane_aggressiveness, dishision_assisted)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      id,
      input.source,
      input.sourceUrl ?? null,
      input.originalRecipeId ?? null,
      input.draft ? JSON.stringify(input.draft) : null,
      input.settings.model,
      JSON.stringify(input.settings),
    ],
  );
  const chat = await getChat(db, id);
  if (!chat) throw new Error('Failed to create chat');
  return chat;
}

export async function getChat(db: DbClient, id: string): Promise<BotChat | null> {
  const row = await db.getFirstAsync<ChatRow>('SELECT * FROM bot_chat WHERE id = ?', [id]);
  return row ? mapChat(row) : null;
}

export interface ChatSummary {
  id: string;
  name: string | null;
  snippet: string;
  updatedAt: string;
  savedRecipeId: number | null;
  source: BotChatSource;
}

// The Chat History list (§3.5): recipe name (or placeholder), snippet of the
// last message, last-updated timestamp, most-recent first.
export async function listChatSummaries(db: DbClient): Promise<ChatSummary[]> {
  const rows = await db.getAllAsync<ChatRow>('SELECT * FROM bot_chat ORDER BY updated_at DESC');
  const summaries: ChatSummary[] = [];
  for (const row of rows) {
    const last = await db.getFirstAsync<{ content: string }>(
      'SELECT content FROM bot_chat_message WHERE chat_id = ? ORDER BY created_at DESC LIMIT 1',
      [row.id],
    );
    const draft = parseDraft(row.recipe_draft_json);
    summaries.push({
      id: row.id,
      name: draft?.name ?? null,
      snippet: (last?.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
      updatedAt: row.updated_at,
      savedRecipeId: row.saved_recipe_id,
      source: row.source as BotChatSource,
    });
  }
  return summaries;
}

async function touch(db: DbClient, chatId: string): Promise<void> {
  await db.runAsync("UPDATE bot_chat SET updated_at = datetime('now') WHERE id = ?", [chatId]);
}

export async function appendMessage(db: DbClient, chatId: string, role: BotMessageRole, content: string): Promise<BotMessage> {
  const id = uuidv4();
  await db.runAsync('INSERT INTO bot_chat_message (id, chat_id, role, content) VALUES (?, ?, ?, ?)', [id, chatId, role, content]);
  await touch(db, chatId);
  const row = await db.getFirstAsync<{ id: string; chat_id: string; role: string; content: string; created_at: string }>(
    'SELECT * FROM bot_chat_message WHERE id = ?',
    [id],
  );
  return {
    id,
    chatId,
    role,
    content,
    createdAt: row?.created_at ?? new Date().toISOString(),
  };
}

export async function getMessages(db: DbClient, chatId: string): Promise<BotMessage[]> {
  const rows = await db.getAllAsync<{ id: string; chat_id: string; role: string; content: string; created_at: string }>(
    'SELECT * FROM bot_chat_message WHERE chat_id = ? ORDER BY created_at ASC, rowid ASC',
    [chatId],
  );
  return rows.map((r) => ({ id: r.id, chatId: r.chat_id, role: r.role as BotMessageRole, content: r.content, createdAt: r.created_at }));
}

export async function updateDraft(db: DbClient, chatId: string, draft: ProposedRecipe | null): Promise<void> {
  await db.runAsync("UPDATE bot_chat SET recipe_draft_json = ?, updated_at = datetime('now') WHERE id = ?", [
    draft ? JSON.stringify(draft) : null,
    chatId,
  ]);
}

export async function setModelUsed(db: DbClient, chatId: string, model: string): Promise<void> {
  await db.runAsync('UPDATE bot_chat SET model_used = ? WHERE id = ?', [model, chatId]);
}

export async function updateChatSettings(db: DbClient, chatId: string, settings: BotBehaviourSettings): Promise<void> {
  await db.runAsync('UPDATE bot_chat SET lane_aggressiveness = ?, model_used = ? WHERE id = ?', [
    JSON.stringify(settings),
    settings.model,
    chatId,
  ]);
}

// A link used mid-chat records its URL (and marks the chat's source) so §11 can
// stamp origin_url on save.
export async function setSourceUrl(db: DbClient, chatId: string, url: string): Promise<void> {
  await db.runAsync("UPDATE bot_chat SET source = 'link', source_url = ?, updated_at = datetime('now') WHERE id = ?", [url, chatId]);
}

export async function setSavedRecipe(db: DbClient, chatId: string, recipeId: number): Promise<void> {
  await db.runAsync("UPDATE bot_chat SET saved_recipe_id = ?, updated_at = datetime('now') WHERE id = ?", [recipeId, chatId]);
}

export async function setDishisionAssisted(db: DbClient, chatId: string, on: boolean): Promise<void> {
  await db.runAsync('UPDATE bot_chat SET dishision_assisted = ? WHERE id = ?', [on ? 1 : 0, chatId]);
}

export async function deleteChat(db: DbClient, chatId: string): Promise<void> {
  await db.runAsync('DELETE FROM bot_chat WHERE id = ?', [chatId]);
}
