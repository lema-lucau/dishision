// Migration 001 — the full §2.3 schema, verbatim. There is no separate
// "base schema" path: a fresh install runs this exact migration, same as
// every upgrade (§2.6). Do not ALTER this file once it has shipped — add a
// new numbered migration instead.
export const migration001 = `
-- ============================================================
-- REFERENCE DATA
-- ============================================================

CREATE TABLE canonical_ingredient (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    name                TEXT NOT NULL UNIQUE,
    base_unit           TEXT NOT NULL,           -- 'g' | 'ml' | 'unit'
    pack_size           REAL,                    -- e.g. 200 (in base_unit)
    pack_label          TEXT,                    -- e.g. 'bag'
    kcal_per_100        REAL,
    protein_per_100     REAL,
    carbs_per_100       REAL,
    fat_per_100         REAL,
    cost_per_100        REAL,                    -- in the display currency (§5.10); seed data is EUR
    cost_updated_at     TEXT,
    density             REAL,                    -- g per ml, for volume→weight
    source              TEXT NOT NULL DEFAULT 'seed',  -- 'seed' | 'user'
    seed_id             TEXT UNIQUE,             -- stable identity for restore
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_canon_name ON canonical_ingredient(name);
CREATE INDEX idx_canon_seed ON canonical_ingredient(seed_id);

CREATE TABLE canonical_ingredient_alias (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    canonical_id        INTEGER NOT NULL REFERENCES canonical_ingredient(id) ON DELETE CASCADE,
    alias               TEXT NOT NULL UNIQUE
);

CREATE INDEX idx_alias_lookup ON canonical_ingredient_alias(alias);

CREATE TABLE tag (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    name                TEXT NOT NULL UNIQUE,
    type                TEXT NOT NULL,           -- 'protein' | 'diet' | 'style' | 'equipment' | 'custom'
    colour              TEXT,                    -- hex, for calendar colouring
    seed_id             TEXT UNIQUE
);

-- ============================================================
-- RECIPES
-- ============================================================

CREATE TABLE recipe (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    share_id            TEXT NOT NULL UNIQUE,    -- UUID, follows lineage across shares
    name                TEXT NOT NULL,
    description         TEXT,
    photo_uri           TEXT,
    photo_emoji         TEXT NOT NULL DEFAULT '🍽️',  -- placeholder tile when photo_uri IS NULL (§9.1)
    visibility          TEXT NOT NULL DEFAULT 'private', -- 'private' | 'public' (§2.4)
    base_servings       INTEGER NOT NULL DEFAULT 2,
    timeline_mode       TEXT NOT NULL DEFAULT 'sequential',  -- 'sequential' | 'parallel'
    source              TEXT NOT NULL DEFAULT 'manual',      -- 'seed' | 'manual' | 'imported'
    seed_id             TEXT UNIQUE,             -- present only when source='seed'
    origin_label        TEXT,                    -- 'Nana''s recipe', 'BBC Good Food'
    origin_url          TEXT,
    imported_from       TEXT,                    -- display name of sender
    imported_at         TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_recipe_share ON recipe(share_id);
CREATE INDEX idx_recipe_seed ON recipe(seed_id);
CREATE INDEX idx_recipe_name ON recipe(name);

CREATE TABLE recipe_ingredient (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id           INTEGER NOT NULL REFERENCES recipe(id) ON DELETE CASCADE,
    canonical_id        INTEGER REFERENCES canonical_ingredient(id) ON DELETE SET NULL,
    display_name        TEXT NOT NULL,           -- 'chicken thigh, diced'
    quantity            REAL NOT NULL,
    unit                TEXT NOT NULL,           -- 'g' | 'ml' | 'tsp' | 'tbsp' | 'cup' | 'unit'
    scalable            INTEGER NOT NULL DEFAULT 1,
    optional            INTEGER NOT NULL DEFAULT 0,
    sort_order          INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_ri_recipe ON recipe_ingredient(recipe_id);
CREATE INDEX idx_ri_canon ON recipe_ingredient(canonical_id);

CREATE TABLE step_lane (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id           INTEGER NOT NULL REFERENCES recipe(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,           -- 'rice', 'chicken', 'sauce'
    sort_order          INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_lane_recipe ON step_lane(recipe_id);

CREATE TABLE recipe_step (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id           INTEGER NOT NULL REFERENCES recipe(id) ON DELETE CASCADE,
    lane_id             INTEGER REFERENCES step_lane(id) ON DELETE SET NULL,
    phase               TEXT NOT NULL,           -- 'prep' | 'cook'
    instruction         TEXT NOT NULL,
    duration_seconds    INTEGER,                 -- NULL for untimed prep steps
    start_offset_seconds INTEGER NOT NULL DEFAULT 0,  -- authored for 'parallel'; DERIVED at read time for 'sequential' (§5.6)
    effort              TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'passive'
    important           INTEGER NOT NULL DEFAULT 0,      -- forces an alert
    sort_order          INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_step_recipe ON recipe_step(recipe_id, phase, start_offset_seconds);

CREATE TABLE recipe_tag (
    recipe_id           INTEGER NOT NULL REFERENCES recipe(id) ON DELETE CASCADE,
    tag_id              INTEGER NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
    PRIMARY KEY (recipe_id, tag_id)
);

-- ============================================================
-- PERSONAL DATA (never shared)
-- ============================================================

CREATE TABLE cook_log (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id           INTEGER NOT NULL REFERENCES recipe(id) ON DELETE CASCADE,
    author_id           TEXT NOT NULL DEFAULT 'me',   -- forward-compat for v2 household
    cooked_at           TEXT NOT NULL,
    servings_made       INTEGER NOT NULL,
    servings_eaten      INTEGER,
    stars               INTEGER,                 -- 1..5, NULL = unrated
    notes               TEXT,
    what_went_well      TEXT,
    what_to_change      TEXT,
    completed           INTEGER NOT NULL DEFAULT 1,
    via_cooking_mode    INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_log_recipe ON cook_log(recipe_id);
CREATE INDEX idx_log_date ON cook_log(cooked_at);

-- Leftover state. Created at cook-complete when made > eaten (§5.7).
-- Deliberately STORED, not derived: eating or binning leftovers is a user
-- action with no other source of truth. The one sanctioned exception to §2.5.
CREATE TABLE leftover (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    cook_log_id         INTEGER NOT NULL REFERENCES cook_log(id) ON DELETE CASCADE,
    servings_remaining  REAL NOT NULL,
    expires_at          TEXT NOT NULL,           -- default cooked_at + 3 days, editable
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_leftover_expiry ON leftover(expires_at);

CREATE TABLE cook_log_tag (
    cook_log_id         INTEGER NOT NULL REFERENCES cook_log(id) ON DELETE CASCADE,
    tag                 TEXT NOT NULL,           -- 'too salty' | 'perfect' | 'too slow' | ...
    PRIMARY KEY (cook_log_id, tag)
);

CREATE TABLE cook_log_photo (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    cook_log_id         INTEGER NOT NULL REFERENCES cook_log(id) ON DELETE CASCADE,
    uri                 TEXT NOT NULL,
    sort_order          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE cook_log_substitution (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    cook_log_id         INTEGER NOT NULL REFERENCES cook_log(id) ON DELETE CASCADE,
    original_ingredient_id INTEGER REFERENCES recipe_ingredient(id) ON DELETE SET NULL,
    original_text       TEXT NOT NULL,           -- snapshot, survives recipe edits
    replacement_text    TEXT NOT NULL,
    verdict             TEXT,                    -- 'better' | 'same' | 'worse'
    promoted            INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE favourite (
    recipe_id           INTEGER PRIMARY KEY REFERENCES recipe(id) ON DELETE CASCADE,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE recipe_exclusion (
    recipe_id           INTEGER PRIMARY KEY REFERENCES recipe(id) ON DELETE CASCADE,
    kind                TEXT NOT NULL,           -- 'never_again' | 'not_tonight'
    expires_at          TEXT,                    -- NULL for never_again
    reason              TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Upsert rule: one row per recipe. 'never_again' always overwrites
-- 'not_tonight'; 'not_tonight' never overwrites 'never_again'.

-- ============================================================
-- PLANNING
-- ============================================================

CREATE TABLE planned_meal (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id           INTEGER NOT NULL REFERENCES recipe(id) ON DELETE CASCADE,
    planned_date        TEXT NOT NULL,           -- YYYY-MM-DD
    slot                TEXT NOT NULL DEFAULT 'dinner',  -- 'breakfast' | 'lunch' | 'dinner' | 'other'
    planned_servings    INTEGER NOT NULL DEFAULT 2,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_plan_date ON planned_meal(planned_date);

CREATE TABLE shopping_list (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    name                TEXT,
    range_start         TEXT,                    -- YYYY-MM-DD
    range_end           TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at        TEXT
);

CREATE TABLE shopping_list_item (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id             INTEGER NOT NULL REFERENCES shopping_list(id) ON DELETE CASCADE,
    canonical_id        INTEGER REFERENCES canonical_ingredient(id) ON DELETE SET NULL,
    display_name        TEXT NOT NULL,
    quantity            REAL NOT NULL,           -- the PURCHASE quantity (pack-rounded, §3.5)
    unit                TEXT NOT NULL,
    checked             INTEGER NOT NULL DEFAULT 0,
    checked_at          TEXT,
    manual              INTEGER NOT NULL DEFAULT 0,   -- added by hand, not from a plan
    sort_order          INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_sli_list ON shopping_list_item(list_id);

CREATE TABLE staple (
    canonical_id        INTEGER PRIMARY KEY REFERENCES canonical_ingredient(id) ON DELETE CASCADE,
    running_low         INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE pantry_item (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    canonical_id        INTEGER NOT NULL UNIQUE REFERENCES canonical_ingredient(id) ON DELETE CASCADE,
    quantity            REAL NOT NULL,           -- always in canonical base_unit
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE pantry_movement (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    canonical_id        INTEGER NOT NULL REFERENCES canonical_ingredient(id) ON DELETE CASCADE,
    delta               REAL NOT NULL,           -- +bought, −cooked
    reason              TEXT NOT NULL,           -- 'shopping' | 'cook' | 'manual'
    cook_log_id         INTEGER REFERENCES cook_log(id) ON DELETE SET NULL,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_movement_date ON pantry_movement(created_at);

-- ============================================================
-- RUNTIME
-- ============================================================

CREATE TABLE cooking_session (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id           INTEGER NOT NULL REFERENCES recipe(id) ON DELETE CASCADE,
    servings            INTEGER NOT NULL,
    phase               TEXT NOT NULL,           -- 'prep' | 'cook'
    started_at          TEXT NOT NULL,
    elapsed_seconds     INTEGER NOT NULL DEFAULT 0,
    paused_at           TEXT,                    -- NULL when running
    drift_seconds       INTEGER NOT NULL DEFAULT 0,
    current_step_id     INTEGER REFERENCES recipe_step(id) ON DELETE SET NULL,
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Write cadence: rows are written on EVENTS ONLY — pause, resume, step
-- advance, drift recalculation, app background. Never on a per-second tick.
-- Elapsed time is derived from started_at plus pause history on resume.

CREATE TABLE cooking_session_step (
    session_id          INTEGER NOT NULL REFERENCES cooking_session(id) ON DELETE CASCADE,
    step_id             INTEGER NOT NULL REFERENCES recipe_step(id) ON DELETE CASCADE,
    started_at          TEXT,
    completed_at        TEXT,
    PRIMARY KEY (session_id, step_id)
);

CREATE TABLE setting (
    key                 TEXT PRIMARY KEY,
    value               TEXT NOT NULL
);
-- Keys include: median_cost_per_serving, median_cost_computed_at,
-- recency_window_days, weights (w_recency etc.), auto_add_shortfalls
-- ('1' default — §5.7), currency_code + currency_symbol ('EUR' / '€'
-- default — display only, §5.10), cost_staleness_days, theme,
-- alert toggles, debug_mode.

-- ============================================================
-- IDENTITY & HOUSEHOLD
-- ============================================================

-- Exactly one row. This device's owner.
CREATE TABLE profile (
    id                  INTEGER PRIMARY KEY CHECK (id = 1),
    person_id           TEXT NOT NULL UNIQUE,    -- UUID, minted on first run
    display_name        TEXT NOT NULL,
    avatar_uri          TEXT,                    -- NULL → use avatar_emoji
    avatar_emoji        TEXT NOT NULL,           -- random food emoji at first run
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE household_member (
    person_id           TEXT PRIMARY KEY,        -- their profile.person_id
    display_name        TEXT NOT NULL,
    avatar_uri          TEXT,
    avatar_emoji        TEXT NOT NULL,
    sync_secret         TEXT NOT NULL,           -- 32 random bytes, hex; minted at pairing (§7.5)
    last_known_address  TEXT,                    -- 'ip:port' from the last successful contact
    added_at            TEXT NOT NULL DEFAULT (datetime('now')),
    last_synced_at      TEXT,
    removed_at          TEXT                     -- tombstone; NULL = active
);

CREATE INDEX idx_member_active ON household_member(removed_at);

-- Their public recipes, cached read-only. Never enters the main library.
CREATE TABLE household_recipe_cache (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id           TEXT NOT NULL REFERENCES household_member(person_id) ON DELETE CASCADE,
    share_id            TEXT NOT NULL,
    payload             TEXT NOT NULL,           -- the full §7.1 JSON
    name                TEXT NOT NULL,           -- denormalised for list/sort/filter
    description         TEXT,
    total_seconds       INTEGER,
    active_seconds      INTEGER,
    kcal_per_serving    REAL,
    cost_per_serving    REAL,
    is_favourite        INTEGER NOT NULL DEFAULT 0,   -- THEIR favourite flag
    favourited_at       TEXT,                    -- for top-5-by-date-added ordering
    synced_at           TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (person_id, share_id)
);

CREATE INDEX idx_hrc_person ON household_recipe_cache(person_id);
CREATE INDEX idx_hrc_fav ON household_recipe_cache(person_id, is_favourite, favourited_at);

-- Ratings received from household members. Keyed on share_id, NOT recipe_id,
-- so ratings for recipes we don't have arrive and wait (§7.6).
CREATE TABLE household_rating (
    person_id           TEXT NOT NULL REFERENCES household_member(person_id) ON DELETE CASCADE,
    share_id            TEXT NOT NULL,
    stars               REAL NOT NULL,
    synced_at           TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (person_id, share_id)
);

CREATE INDEX idx_hr_share ON household_rating(share_id);

CREATE TABLE sync_event (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id           TEXT NOT NULL,
    direction           TEXT NOT NULL,           -- 'sent' | 'received'
    kind                TEXT NOT NULL,           -- 'profile' | 'recipes' | 'ratings' | 'tombstone'
    item_count          INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
`;
