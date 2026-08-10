// §B2 persisted recipe version history. Each advance of a chat's working draft
// appends a row (linear, monotonic version_index per chat). draft_json is the
// proposed draft (same shape as bot_chat.draft); change_summary_json is the
// accepted BotDiffChanges that produced this version (null for the initial
// recipe or a restore). Restoring appends a new head rather than branching.
import type { DbClient } from '../db/DbClient';
import type { BotDiffChange } from './botRecipeDiff';
import type { ProposedRecipe } from './types';

export interface BotRecipeVersion {
  id: number;
  chatId: string;
  versionIndex: number;
  draft: ProposedRecipe;
  changeSummary: BotDiffChange[] | null;
  label: string | null;
  createdAt: string;
}

interface VersionRow {
  id: number;
  chat_id: string;
  version_index: number;
  draft_json: string;
  change_summary_json: string | null;
  label: string | null;
  created_at: string;
}

function parseJson<T>(json: string | null): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function mapRow(row: VersionRow): BotRecipeVersion {
  return {
    id: row.id,
    chatId: row.chat_id,
    versionIndex: row.version_index,
    draft: JSON.parse(row.draft_json) as ProposedRecipe,
    changeSummary: parseJson<BotDiffChange[]>(row.change_summary_json),
    label: row.label,
    createdAt: row.created_at,
  };
}

async function nextVersionIndex(db: DbClient, chatId: string): Promise<number> {
  const row = await db.getFirstAsync<{ max: number | null }>(
    'SELECT MAX(version_index) as max FROM bot_recipe_version WHERE chat_id = ?',
    [chatId],
  );
  return row?.max == null ? 0 : row.max + 1;
}

export async function countVersions(db: DbClient, chatId: string): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM bot_recipe_version WHERE chat_id = ?', [chatId]);
  return row?.count ?? 0;
}

// Append a version. Returns the new version's index. `changeSummary` should be
// the accepted changes that produced this draft (null for initial/restore).
export async function writeVersion(
  db: DbClient,
  chatId: string,
  draft: ProposedRecipe,
  changeSummary: BotDiffChange[] | null,
  label: string | null = null,
): Promise<number> {
  const versionIndex = await nextVersionIndex(db, chatId);
  await db.runAsync(
    'INSERT INTO bot_recipe_version (chat_id, version_index, draft_json, change_summary_json, label) VALUES (?, ?, ?, ?, ?)',
    [chatId, versionIndex, JSON.stringify(draft), changeSummary ? JSON.stringify(changeSummary) : null, label],
  );
  return versionIndex;
}

export async function listVersions(db: DbClient, chatId: string): Promise<BotRecipeVersion[]> {
  const rows = await db.getAllAsync<VersionRow>(
    'SELECT * FROM bot_recipe_version WHERE chat_id = ? ORDER BY version_index DESC',
    [chatId],
  );
  return rows.map(mapRow);
}

export async function getVersion(db: DbClient, id: number): Promise<BotRecipeVersion | null> {
  const row = await db.getFirstAsync<VersionRow>('SELECT * FROM bot_recipe_version WHERE id = ?', [id]);
  return row ? mapRow(row) : null;
}
