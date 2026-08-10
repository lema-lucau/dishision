// Migration 012 — persisted recipe version history for a Dishision Bot chat
// (§B2). Each time the working draft advances (initial proposal, an applied
// diff, or a restore) a row is appended, newest by version_index. draft_json is
// the proposed draft (same shape as bot_chat.recipe_draft_json);
// change_summary_json is the accepted BotDiffChanges that produced this version
// (null for the initial recipe). History is linear — restoring appends a new
// head, never truncates or branches.
//
// ON DELETE CASCADE: versions belong to their chat; evicting/deleting a chat
// takes its history with it (the saved recipe it produced is untouched — that's
// a separate FK on bot_chat).
export const migration012 = `
CREATE TABLE bot_recipe_version (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL REFERENCES bot_chat(id) ON DELETE CASCADE,
  version_index INTEGER NOT NULL,
  draft_json TEXT NOT NULL,
  change_summary_json TEXT,
  label TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_bot_recipe_version_chat ON bot_recipe_version (chat_id, version_index);
`;
