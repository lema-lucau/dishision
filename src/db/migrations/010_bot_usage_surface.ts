// Migration 010 — tag every Dishision Bot API call with the surface it came
// from (§A1.4). Once the bot has several surfaces (recipe chat, cook-log refine,
// cooking quick-ask, weekly planning, "I'm feeling" fallback), the Stats view
// can answer "which bot feature am I actually using / what's costing me" —
// useful for deciding what to keep. Nullable: rows written before this migration
// (and any future call that doesn't tag itself) simply have no surface.
export const migration010 = `
ALTER TABLE bot_usage_log ADD COLUMN surface TEXT;
`;
