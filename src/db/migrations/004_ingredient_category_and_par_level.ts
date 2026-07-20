// Migration 004 — two additions from the Ingredients/Pantry improvements
// pass:
//
// 1. canonical_ingredient.category — a coarse food-group label (beef,
//    chicken, fish, pork, lamb, vegetable, fruit, dairy, staple, other) used
//    purely to group the Pantry screen's Pantry and Staples lists into
//    section-labelled clusters. Nullable — existing/seeded rows without a
//    curated category fall under "Other" at render time rather than needing
//    a backfill pass to be valid data.
//
// 2. staple.par_level — the quantity (in the ingredient's own base_unit)
//    below which a staple counts as "running low". Nullable: when unset, the
//    running_low flag stays a manual on/off toggle exactly as before (no
//    regression for staples nobody has set a par level for yet).
export const migration004 = `
ALTER TABLE canonical_ingredient ADD COLUMN category TEXT;
ALTER TABLE staple ADD COLUMN par_level REAL;
`;
