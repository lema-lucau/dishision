// Migration 009 — per-item sync detail (§B6). The sync_event row records that a
// sync happened and how many items it carried; sync_log_item records WHAT those
// items were, so the sync log can answer "which recipes / whose ratings / which
// cooks" rather than just "sync completed".
//
// name_snapshot is stored so a deleted target still displays. recipe_id is the
// local library recipe when we have one (the navigation target), ON DELETE SET
// NULL so a since-deleted recipe surfaces as unavailable rather than dangling.
export const migration009 = `
CREATE TABLE sync_log_item (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_event_id   INTEGER NOT NULL REFERENCES sync_event(id) ON DELETE CASCADE,
    item_type       TEXT NOT NULL,   -- 'recipe' | 'rating' | 'cook_log'
    action          TEXT NOT NULL,   -- 'added' | 'updated' | 'skipped' | 'sent' | 'received'
    recipe_id       INTEGER REFERENCES recipe(id) ON DELETE SET NULL,  -- local recipe, if we have it
    share_id        TEXT,            -- lineage id, for ratings/recipes
    name_snapshot   TEXT NOT NULL,   -- survives deletion of the target
    detail          TEXT,            -- rating value, cook date, etc.
    sort_order      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_sync_item_event ON sync_log_item(sync_event_id);
`;
