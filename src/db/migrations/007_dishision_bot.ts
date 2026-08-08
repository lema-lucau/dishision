// Migration 007 — Dishision Bot (recipe-creation-spec §4). Three new tables:
// the chat itself (one row per conversation, carrying the running recipe
// candidate as JSON), its messages, and a usage log powering the Stats view
// (§12). All three are personal/runtime data — none of it is shareable and
// none of it touches the recipe schema until an explicit Save writes into
// recipe/recipe_ingredient/recipe_step/step_lane.
//
// original_recipe_id / saved_recipe_id are ON DELETE SET NULL, never CASCADE:
// deleting a recipe must not silently erase the conversation that produced or
// refined it (§4 — "deleting a chat never deletes a recipe" and its converse).
export const migration007 = `
CREATE TABLE bot_chat (
    id                  TEXT PRIMARY KEY,               -- uuid
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    source              TEXT NOT NULL DEFAULT 'chat',   -- 'chat' | 'paste_text' | 'link' | 'existing_recipe'
    source_url          TEXT,                            -- populated when source = 'link'
    original_recipe_id  INTEGER REFERENCES recipe(id) ON DELETE SET NULL,  -- source = 'existing_recipe'
    recipe_draft_json   TEXT,                            -- current best-guess candidate (§7 propose_recipe shape)
    saved_recipe_id     INTEGER REFERENCES recipe(id) ON DELETE SET NULL,  -- set once saved
    model_used          TEXT,
    lane_aggressiveness TEXT,                            -- snapshot of the whole settings block at chat start (JSON)
    dishision_assisted  INTEGER NOT NULL DEFAULT 0       -- the §11 "Mark as Dishision Assisted" choice, remembered per chat
);

CREATE INDEX idx_bot_chat_updated ON bot_chat(updated_at);

CREATE TABLE bot_chat_message (
    id                  TEXT PRIMARY KEY,               -- uuid
    chat_id             TEXT NOT NULL REFERENCES bot_chat(id) ON DELETE CASCADE,
    role                TEXT NOT NULL,                   -- 'user' | 'assistant'
    content             TEXT NOT NULL,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_bot_msg_chat ON bot_chat_message(chat_id, created_at);

CREATE TABLE bot_usage_log (
    id                  TEXT PRIMARY KEY,               -- uuid
    chat_id             TEXT REFERENCES bot_chat(id) ON DELETE SET NULL,
    model               TEXT NOT NULL,
    input_tokens        INTEGER NOT NULL DEFAULT 0,
    output_tokens       INTEGER NOT NULL DEFAULT 0,
    estimated_cost      REAL NOT NULL DEFAULT 0,          -- USD, computed at log time (§12)
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_bot_usage_created ON bot_usage_log(created_at);
CREATE INDEX idx_bot_usage_model ON bot_usage_log(model);
`;
