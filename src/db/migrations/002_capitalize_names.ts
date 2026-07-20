// Migration 002 — one-time backfill: capitalise the first letter of every
// existing ingredient/tag/substitution-text row so old data matches the
// capitalisation rule now enforced at write time (see src/utils/text.ts).
// UNIQUE-constrained columns use UPDATE OR IGNORE so a pre-existing
// case-only collision (e.g. both 'chicken' and 'Chicken' already present)
// skips rather than aborting the whole migration.
export const migration002 = `
UPDATE OR IGNORE canonical_ingredient SET name = UPPER(SUBSTR(name, 1, 1)) || SUBSTR(name, 2) WHERE name <> UPPER(SUBSTR(name, 1, 1)) || SUBSTR(name, 2);
UPDATE OR IGNORE canonical_ingredient_alias SET alias = UPPER(SUBSTR(alias, 1, 1)) || SUBSTR(alias, 2) WHERE alias <> UPPER(SUBSTR(alias, 1, 1)) || SUBSTR(alias, 2);
UPDATE OR IGNORE tag SET name = UPPER(SUBSTR(name, 1, 1)) || SUBSTR(name, 2) WHERE name <> UPPER(SUBSTR(name, 1, 1)) || SUBSTR(name, 2);
UPDATE recipe_ingredient SET display_name = UPPER(SUBSTR(display_name, 1, 1)) || SUBSTR(display_name, 2) WHERE display_name <> UPPER(SUBSTR(display_name, 1, 1)) || SUBSTR(display_name, 2);
UPDATE shopping_list_item SET display_name = UPPER(SUBSTR(display_name, 1, 1)) || SUBSTR(display_name, 2) WHERE display_name <> UPPER(SUBSTR(display_name, 1, 1)) || SUBSTR(display_name, 2);
UPDATE OR IGNORE cook_log_tag SET tag = UPPER(SUBSTR(tag, 1, 1)) || SUBSTR(tag, 2) WHERE tag <> UPPER(SUBSTR(tag, 1, 1)) || SUBSTR(tag, 2);
UPDATE cook_log_substitution SET original_text = UPPER(SUBSTR(original_text, 1, 1)) || SUBSTR(original_text, 2) WHERE original_text <> UPPER(SUBSTR(original_text, 1, 1)) || SUBSTR(original_text, 2);
UPDATE cook_log_substitution SET replacement_text = UPPER(SUBSTR(replacement_text, 1, 1)) || SUBSTR(replacement_text, 2) WHERE replacement_text <> UPPER(SUBSTR(replacement_text, 1, 1)) || SUBSTR(replacement_text, 2);
`;
