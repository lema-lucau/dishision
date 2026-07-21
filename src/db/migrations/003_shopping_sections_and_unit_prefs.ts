// Migration 003 — two additions from the Planning-screen improvements pass:
//
// 1. shopping_list_item grows a recipe-attribution + "buy count" shape so a
//    generated list can be shown sectioned by recipe (§5.8 "Shopping"
//    improvements): recipe_id/name/emoji identify which recipe a line came
//    from (name+emoji denormalised, same convention as
//    household_recipe_cache, so a section heading survives the source
//    recipe being edited or deleted later); is_common flags a line that was
//    identical across >=2 recipes and got merged into the "Common" section;
//    buy_count is the "x N" multiplier shown on a Common line instead of
//    silently summing the quantity.
//
// 2. ingredient_unit_preference — a per-canonical-ingredient *display* unit
//    override for the Pantry screen. pantry_item.quantity remains stored in
//    base units always (§3.1, unchanged) — this table never touches that
//    invariant, it only says which unit the Pantry screen should render a
//    row in. Row absent = show in base_unit (the default); deleting the row
//    ("reset to default") is exactly what the Pantry screen's reset button
//    does.
export const migration003 = `
ALTER TABLE shopping_list_item ADD COLUMN recipe_id INTEGER REFERENCES recipe(id) ON DELETE SET NULL;
ALTER TABLE shopping_list_item ADD COLUMN recipe_name TEXT;
ALTER TABLE shopping_list_item ADD COLUMN recipe_emoji TEXT;
ALTER TABLE shopping_list_item ADD COLUMN is_common INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shopping_list_item ADD COLUMN buy_count INTEGER NOT NULL DEFAULT 1;

CREATE TABLE ingredient_unit_preference (
    canonical_id        INTEGER PRIMARY KEY REFERENCES canonical_ingredient(id) ON DELETE CASCADE,
    unit                TEXT NOT NULL,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
`;
