// Migration 005 — per-ingredient price points.
//
// Until now cost lived as a single canonical_ingredient.cost_per_100 (cost per
// 100 base units). Real shopping is messier: the same ingredient sells in
// several pack sizes at different prices (500 g for €3, 1 kg for €5…). This
// table stores each of those quantity+unit+price observations. The single
// cost_per_100 column is kept as the derived figure the rest of the cost
// pipeline already reads — recomputed (best value per base unit) whenever an
// ingredient's price points change — so nothing downstream needs to know
// prices became a list.
export const migration005 = `
CREATE TABLE IF NOT EXISTS ingredient_price (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_id  INTEGER NOT NULL REFERENCES canonical_ingredient(id) ON DELETE CASCADE,
  quantity      REAL NOT NULL,
  unit          TEXT NOT NULL,
  price         REAL NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ingredient_price_canonical ON ingredient_price(canonical_id);
`;
