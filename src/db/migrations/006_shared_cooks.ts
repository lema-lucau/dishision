// Migration 006 — shared cooks outbox (§7 household).
//
// When you finish a cook you can mark household members as people you cooked
// with. Each such (member, cook) pair is queued here as a local record and
// pushed to that member on the next sync, where it becomes a cook_log on their
// device. The outbox is the offline queue: entries sit here with synced_at
// NULL until a sync to that member succeeds, so a cook shared while off the
// same network still lands later, exactly once.
export const migration006 = `
CREATE TABLE IF NOT EXISTS shared_cook_outbox (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_person_id   TEXT NOT NULL,
  recipe_share_id       TEXT NOT NULL,   -- matched against the recipient's own recipe.share_id
  recipe_name           TEXT NOT NULL,   -- denormalised, for display
  cooked_at             TEXT NOT NULL,
  servings_made         INTEGER NOT NULL,
  servings_eaten        INTEGER NOT NULL,
  stars                 REAL,
  notes                 TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  synced_at             TEXT
);
CREATE INDEX IF NOT EXISTS idx_sco_pending ON shared_cook_outbox(recipient_person_id, synced_at);
`;
