// Migration 011 — trace a cook-log refine chat back to the specific cook that
// prompted it (§A2.3). A 'cook_log' source chat behaves like an existing-recipe
// refine (original_recipe_id set) but is anchored to one cook, whose feedback
// (notes, substitutions, rating, servings) seeds the bot's opening proposal.
//
// ON DELETE SET NULL: deleting the cook log must not erase the chat (nor the
// recipe it may have overwritten) — the same rule that governs original_recipe_id.
export const migration011 = `
ALTER TABLE bot_chat ADD COLUMN origin_cook_log_id INTEGER REFERENCES cook_log(id) ON DELETE SET NULL;
`;
