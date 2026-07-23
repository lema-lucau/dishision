# Dishision — Design & Implementation Spec

**Version:** 1.5
**Platform:** React Native / Expo SDK 54, SQLite, Android
**Users:** Independent profiles on separate phones, optionally linked into a household over local WiFi
**Status:** Specification — not yet implemented

> **Visual treatment & layout — see the companion `dishision-visual-redesign-spec.md` ("Warm Editorial", R-sections).** This base spec defines *what Dishision is* — data, units, recommendation engine, sharing, theme *architecture*, and screen *behaviour* — and remains authoritative for all of it. The redesign spec defines *how it looks and feels* and **supersedes the visual presentation of §4.5–4.8 and the layout of §5.2–5.10**. The token architecture (§4.1–4.4) and every behavioural rule below are unchanged and still law. Where the two disagree on visuals/layout, the redesign spec wins; on anything else, this one does.

## Table of Contents

1. Product definition  
    1.1 Principles  
    1.2 Non-goals for v1  
    1.3 Target devices  
2. Data model  
    2.1 Core entities  
    2.2 Entity relationships  
    2.3 SQL DDL  
    2.4 Recipe visibility  
    2.5 Derived values — never stored  
    2.6 Database conventions and migrations  
3. Units and conversion  
    3.1 Rules  
    3.2 Conversion table  
    3.3 House standard  
    3.4 Scaling  
    3.5 Pack rounding — shopping only  
4. Design system  
    4.1 Theming architecture  
    4.2 Colour tokens  
    4.3 The seven themes  
    4.4 Category colours (calendar, tags)  
    4.5 Typography  
    4.6 Scale and spacing  
    4.7 Signature element — the time split bar  
    4.8 Emoji photo tiles  
    4.9 Theme roster  
    4.10 Theme picker  
5. Screens  
    5.1 Navigation  
    5.2 Home  
    5.3 "I'm feeling…" picker  
    5.4 Recipes  
    5.5 Recipe detail  
    5.6 Cooking Mode  
    5.7 Cook complete  
    5.8 Plan  
    5.9 Cook log  
    5.10 Me  
    5.11 Household  
    5.12 Member profile  
6. Recommendation engine  
    6.1 Score  
    6.2 Hard filters  
    6.3 Relaxation ladder  
    6.4 Diversity rule  
    6.5 Degradation  
    6.6 Cold start  
    6.7 Dismissal  
    6.8 Median cost cache  
    6.9 Cost staleness  
7. Sharing and import  
    7.1 Payload  
    7.2 Transport  
    7.3 Import  
    7.4 Household sync — scope  
    7.5 Household sync — mechanics  
    7.6 Opinion sync  
8. Photos  
9. Seeded data  
    9.1 Recipes  
    9.2 Ingredients  
    9.3 Restore  
    9.4 Copy and tweak  
10. Backup and export  
11. Testing  
    11.1 Stack  
    11.2 What must be tested  
    11.3 Conventions  
12. Logging & debug mode  
    12.1 Behaviour  
    12.2 Entry shape  
    12.3 Debug screen  
    12.4 Mandatory log points  
13. Build slices  
14. Claude Code session plan  
    S0 — Scaffolding  
    S1 — Schema and foundation  
    S2 — Seed tooling + first batch  
    S3 — Seed library complete  
    S4 — Recipe read path  
    S5 — Recipe write path  
    S6 — Search, sort, filter  
    S7 — Cook logging + leftovers  
    S8 — Cooking Mode  
    S9 — Recommendation engine + Home  
    S10 — Cook log  
    S11 — Planning  
    S12 — Shopping and pantry  
    S13 — Sharing  
    S14 — Profile, stats, settings, backup  
    S15 — Household  
    S16 — Opinion sync  
    S17 — Polish  
15. Constraints and conventions  
    15.1 Dependency allowlist  
16. Open questions  
17. Changelog  

## 1. Product definition

Dishision answers one question: *what are we cooking tonight?*

It is not a recipe manager that happens to make suggestions. It is a decision engine that happens to store recipes. Every architectural choice below follows from that: the home screen leads with an answer, not a search bar; the recommendation engine is the core loop; recipes exist to be cooked, and cooking produces the data that makes the next recommendation better.

### 1.1 Principles

- **Recipes are objective, opinions are private.** A recipe is a shareable artifact. Ratings, logs, favourites, and plans never leave the device. This split drives the entire schema.
- **Degrade honestly.** Macros, costs, and pantry state will always be partially known. The app shows what it knows and says what it doesn't. It never guesses silently.
- **The log is the truth.** Cook counts, streaks, and stats are derived from cook_log rows, never stored as counters. A count that can drift from its source will drift.
- **Cooking is a hostile environment.** Wet hands, bad light, glanced at from three feet. Cooking Mode is designed for that, not for a desk.
- **No nagging.** Everything optional. Prompts are dismissible. A broken habit is not a failure state.

### 1.2 Non-goals for v1

- No cloud, no accounts, no servers — household sync is phone-to-phone over local WiFi only
- No push or remote notifications. Local, on-device notifications are permitted in exactly one place: an active Cooking Mode session (§5.6). No other code path may schedule one.
- No background or continuous sync — every sync is a deliberate, foregrounded act
- No visual drag-and-drop timeline editor (form-based, with a read-only preview)
- No multi-recipe Cooking Mode sessions
- No ingredient expiry modelling (leftovers expire, §5.7 — raw ingredients do not)
- No recipe photos in the seed for v1 — seeded recipes ship with per-recipe emoji placeholders (§9.1); real photos come in a later version, heavily compressed through the §8 pipeline
- No sharing of logs, notes, photos, plans, or pantry — ever. Ratings are the only opinion that can cross, and only on explicit opt-in (§7.6).

### 1.3 Target devices

Dishision is developed and daily-driven on two specific physical phones, not generic emulator profiles. Both are 20:9 aspect ratio, both run edge-to-edge Android gesture navigation — every screen must be sanity-checked against both.

| | Xiaomi 12 Lite | Xiaomi 13T |
| --- | --- | --- |
| Screen | 6.55" AMOLED, 120Hz | 6.67" AMOLED, 144Hz |
| Resolution | 1080 × 2400 px | 1220 × 2712 px |
| Aspect ratio | 20:9 | 20:9 |
| Density | ~402 ppi | ~446 ppi |
| Android | 12 → 14, HyperOS | 13, HyperOS |

The 13T is physically larger with meaningfully higher pixel density and a taller screen — fixed-pixel paddings/font sizes tuned on one device can look cramped or oversized on the other. Prefer relative/flex-based layout and `useWindowDimensions`/`Dimensions` for anything that must adapt; avoid hardcoded absolute heights on scrollable or button-bearing screens.

**Safe areas, always.** Both phones use edge-to-edge gesture navigation with no persistent system chrome reserving space — the app must reserve its own. Any screen with content near the top or bottom edge (footers, floating action rows, headers not already inside a nav header, and *especially* full-bleed screens like Cooking Mode (§5.6) that hide the tab bar) must pull insets from `useSafeAreaInsets` (`react-native-safe-area-context`, §15.1) rather than guessing a fixed padding value. A control that renders at a fixed distance from the bottom of the viewport will sit under the gesture nav bar on one or both devices — this has already bitten the Debug screen and Cooking Mode's control row once each; treat it as a standing checklist item for every new bottom-anchored control, not a one-off fix.

## 2. Data model

### 2.1 Core entities

The central split:

- **Recipe** — objective, shareable, carries a share_id lineage
- **CookLog** — subjective, private, one row per cook
- **CanonicalIngredient** — the reference table powering macros, cost, filtering, and pantry maths

Everything else hangs off these three.

### 2.2 Entity relationships

```
canonical_ingredient
    ↑ (referenced by)
recipe ──< recipe_ingredient
   │
   ├──< recipe_step ──> step_lane
   │
   ├──< recipe_tag >── tag
   │
   ├──< cook_log ──< cook_log_photo
   │        │
   │        ├──< cook_log_substitution
   │        │
   │        └──< leftover
   │
   ├──< favourite
   │
   ├──< recipe_exclusion
   │
   └──< planned_meal

shopping_list ──< shopping_list_item ──> canonical_ingredient
                                              ↑
pantry_item ──────────────────────────────────┘

staple ──> canonical_ingredient
cooking_session ──> recipe

profile (1 row — this device's owner)

household_member ──< household_recipe_cache   (read-only, keyed by share_id)
       │
       └────────────< household_rating        (keyed by share_id, may be orphaned)
```

### 2.3 SQL DDL

```sql
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
-- default — display only, §5.10), cost_staleness_days, theme
-- ('hearth' default — §4.9),
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
```

### 2.4 Recipe visibility

`visibility` lives in the base recipe DDL (`'private' | 'public'`, default `'private'`).

**Private by default, always.** A recipe becomes visible to the household only when explicitly marked public. Marking public affects household sync only — it has nothing to do with §7 share/import, which remains a deliberate per-recipe act regardless of visibility.

Seeded recipes are private on install. There is no bulk "make everything public" action; visibility is a per-recipe decision.

### 2.5 Derived values — never stored

| Value | Derivation |
| --- | --- |
| Times cooked | `SELECT COUNT(*) FROM cook_log WHERE recipe_id=? AND completed=1` |
| Recipe rating | `SELECT AVG(stars) FROM cook_log WHERE recipe_id=? AND stars IS NOT NULL` |
| Last cooked | `SELECT MAX(cooked_at) FROM cook_log WHERE recipe_id=? AND completed=1` |
| Days in last 30 | `SELECT COUNT(DISTINCT date(cooked_at)) FROM cook_log WHERE cooked_at >= date('now','-30 days')` |
| Cost per serving | Σ(ingredient qty in base unit ÷ 100 × cost_per_100) ÷ base_servings |
| Macros per serving | Same pattern with kcal/protein/carbs/fat |
| Active / passive time | Σ duration_seconds grouped by effort |
| Household average | (my avg + Σ household_rating.stars) ÷ (1 + count). **If I have no rating of my own, it is the average of household ratings alone** — never divide by a phantom participant. |
| Their top 5 favourites | household_recipe_cache WHERE is_favourite=1 ORDER BY favourited_at DESC LIMIT 5 |

Rationale: a stored counter and its source will diverge. Deleting a log must decrement the count, and the only way to guarantee that is to never store the count.

**The one exception:** `leftover` (§2.3) is deliberately stored state. Eating or binning leftovers is a real-world event with no other source of truth — it cannot be derived, so it is recorded.

### 2.6 Database conventions and migrations

These are load-bearing. SQLite's defaults will silently betray the schema above without them.

- **`PRAGMA foreign_keys = ON` on every connection, always** — the app's connection *and* every test-harness connection. SQLite ships with foreign keys **off**; every `ON DELETE CASCADE` in §2.3 is decorative until this pragma runs. This is the single most likely silent-corruption bug in the project. The DB-open helper sets it; nothing else opens connections.
- **`PRAGMA journal_mode = WAL`** on the app's connection, for crash resilience mid-cook.
- **Migrations via `PRAGMA user_version`.** Numbered files (`001_initial.sql`, `002_....sql`) applied in order inside a transaction; `user_version` is bumped only after each migration commits. The full §2.3 DDL *is* migration 001 — there is no separate "base schema" path. A fresh install runs the same migration chain as an upgrade.
- **Integration tests build the DB by running the real migration chain**, not a copied schema — so schema drift between app and tests is impossible.

## 3. Units and conversion

The one genuinely hard problem: shopping speaks in packs, recipes speak in grams, and the pantry needs arithmetic.

### 3.1 Rules

- Every canonical_ingredient declares a base_unit: g, ml, or unit.
- pantry_item.quantity is **always** in base units. No exceptions.
- recipe_ingredient may use any unit; it converts to base at read time.
- pack_size + pack_label let shopping display "1 bag (200g)" while storing 200.

### 3.2 Conversion table

| From | To | Factor |
| --- | --- | --- |
| tsp | ml | 5 |
| tbsp | ml | 15 |
| cup | ml | 240 |
| ml | g | × density (default 1.0) |
| unit | g | × pack_size when base_unit='g' |

If a conversion is impossible (no density, no pack size), the ingredient is **unmeasured**: it still displays, still counts for filtering by name, but is excluded from macros, cost, and pantry maths, and contributes to the "9 of 11 ingredients" flag.

### 3.3 House standard

Metric. Grams and millilitres for everything above ~15ml. Teaspoons and tablespoons for small amounts. Never cups for solids.

### 3.4 Scaling

- scalable = 1 → quantity × (target_servings ÷ base_servings)
- scalable = 0 → unchanged (bay leaf, "a pinch of salt", oil for frying)
- Rounding rules:
  - Under 10 → 1 decimal place
  - 10–100 → nearest whole
  - Over 100 → nearest 5
  - Countable units → "1–2 eggs" when the result is fractional

### 3.5 Pack rounding — shopping only

Recipes need 140g of something sold in 200g bags. The shop does not sell 0.7 bags.

- Where `pack_size` exists, a generated shopping-list line rounds **up to whole packs**: `packs = ⌈needed ÷ pack_size⌉`. The line displays both truths: *"1 bag (200 g) — recipes need 140 g"*.
- `shopping_list_item.quantity` stores the **purchase** quantity (the pack-rounded amount, in base units), because that is what checking off adds to the pantry (§5.8). The surplus is real — it goes in the cupboard.
- Where no `pack_size` exists, the raw consolidated quantity is used unchanged.
- Pack rounding applies to generated lines only. Manual lines are whatever the user typed.

## 4. Design system

> **Visual presentation is now led by `dishision-visual-redesign-spec.md`.** The theming *architecture* and token contract in §4.1–4.4 are unchanged and authoritative. The *presentation* rules in §4.5 (typography usage), §4.6 (radius scale), and §4.8 (emoji tiles) are extended/superseded there: the redesign adds a centrally-derived visual layer (elevation, gradients, glow, photo scrim — R2) computed from these same tokens with no new per-theme slots and no component hex, plus softer photo radii (R2.5) and a category-tinted gradient photo fallback that replaces the flat emoji tile at card/hero sizes (R4).

### 4.1 Theming architecture

Dishision ships **seven themes**, user-selectable in settings. **Hearth is the default.**

This is cheap to build *only* because it's designed in from the first commit. Retrofitting themes onto an app with hex literals scattered through components is a week of archaeology; building on tokens from day one makes a new theme a data entry exercise.

**The contract:**

```ts
// Every theme is the same shape. No exceptions.
interface Theme {
  id: string;
  name: string;
  mode: 'light' | 'dark';   // drives status bar + keyboard appearance
  colour: ColourTokens;      // §4.2 — every key required
  category: CategoryColours; // §4.4 — every key required
}
```

**Rules:**

- **Every theme defines every token.** No optional keys, no fallbacks. A theme missing `--amber-text` is a compile error, not a runtime surprise. TypeScript enforces this: `Record<ThemeId, Theme>` with a fully-required `ColourTokens`.
- **No hex literals in components. Ever.** Colour comes from `useTheme()` or it doesn't exist. This is the single constraint the whole system rests on — one stray hex value is a bug that only appears when someone switches theme, which is the worst kind.
- **Dark themes map onto the same slots.** A dark theme cannot invent tokens a light theme lacks. If a token only makes sense in dark, the light themes must still define something sensible for it. This is a real limitation and a healthy one — it stops the token set sprawling.
- **Semantic names, not descriptive ones.** `--accent`, not `--terracotta`. The whole point is that the value changes per theme while the meaning doesn't.

**Implementation:**

```ts
const themes: Record<ThemeId, Theme> = {
  hearth, ember, seaglass, clay, risograph, midnightKitchen, dusk,
};

// Provider reads setting('theme'), defaults to 'hearth'
<ThemeProvider>  →  useTheme(): Theme
```

Switching writes the `theme` row in `setting` (§2.3) and the provider re-renders. **Instant, no animation, applies everywhere at once.** Since switching requires deliberately visiting settings, there's no mid-cook edge case worth engineering around — the user did it on purpose. Apply, close the screen, it's done.

**Cost:** ~half a session for the provider, hook, and picker. Each additional theme after that is a token table and nothing else — the seven below are that exercise done seven times.

### 4.2 Colour tokens

The full required set. Every theme fills every row. Names carried through unchanged from the original Ember proposal so nothing downstream in this spec needs renaming.

| Token | Role |
| --- | --- |
| `--bg` | Page background |
| `--surface` | Cards, tab bar |
| `--surface-warm` | Macro tiles, subtle fills, emoji photo tiles (§4.6) |
| `--chip-bg` | Inactive chips, segmented control track |
| `--border` | Hairlines, dividers |
| `--border-strong` | Ingredient row separators |
| `--accent` | Primary actions, active states, hands-on time |
| `--accent-text` | Text-safe accent (must clear 4.5:1 on `--bg`) |
| `--accent-fg` | Text on accent fills |
| `--amber` | Passive time, warnings |
| `--amber-text` | Text-safe amber |
| `--green` | Success, "you have this" |
| `--red` | Destructive, never-again |
| `--ink` | Primary text |
| `--ink-2` | Secondary text |
| `--ink-3` | Tertiary, labels |
| `--ink-4` | Disabled, inactive tabs |

`--accent-text` and `--amber-text` exist because a colour that works as a button fill often fails as small text. Where the base already clears 4.5:1, the text variant is simply the same value — the slot still has to be filled.

### 4.3 The seven themes

Each table is the full, pinned token set — nothing left as "TBD." Contrast ratios are against that theme's `--bg` unless noted.

#### Hearth — default

```
--bg              #FDF8F3   warm sand, page background
--surface         #FFFFFF   cards, tab bar
--surface-warm    #F5EDE5   macro tiles, emoji photo tiles
--chip-bg         #F3E9DF   inactive chips
--border          #EDE4DA   hairlines
--border-strong   #EFE6DC   row separators

--accent          #C25E3A   terracotta — buttons, hands-on time
--accent-text     #A34A2A   5.8:1 — text-safe variant
--accent-fg       #FFF6F0   text on terracotta

--amber           #E8A33D   passive time, warnings
--amber-text      #92620E   4.7:1 — text-safe amber

--green           #6B8F5E   success, "you have this"
--red             #B3261E   destructive, never-again

--ink             #2C2420   primary text
--ink-2           #7A6E64   secondary text
--ink-3           #A0938A   tertiary, labels
--ink-4           #B8ADA3   disabled, inactive tabs
```

The original proposal, warm terracotta on sand. Cookbook-familiar and safe — the trade-off named in §4.9.

#### Ember

```
--bg              #FFFAF2   warm cream
--surface         #FFFFFF   cards, tab bar
--surface-warm    #FDF1E1   macro tiles, emoji photo tiles
--chip-bg         #FCEBD5   inactive chips
--border          #F6E4CD   hairlines
--border-strong   #F6E9D8   row separators

--accent          #D94F1E   burnt orange — buttons, hands-on time
--accent-text     #B03D14   5.9:1 — text-safe variant
--accent-fg       #FFF6EF   text on orange

--amber           #F5A623   marigold — passive time, warnings
--amber-text      #9A6410   text-safe amber

--green           #5C8A3C   success
--red             #B3261E   destructive

--ink             #2A1F17   primary text
--ink-2           #7E6A56   secondary text
--ink-3           #B0906B   tertiary, labels
--ink-4           #C4A883   disabled, inactive tabs
```

A hotter, more saturated sibling of Hearth. Same family, louder. This was the spec's own working theme before the roster widened — kept for anyone who preferred it.

#### Seaglass

```
--bg              #F2F5F5   cool off-white
--surface         #FFFFFF   cards, tab bar
--surface-warm    #E7EEED   macro tiles, emoji photo tiles
--chip-bg         #E2E9E9   inactive chips
--border          #DCE4E4   hairlines
--border-strong   #E4EBEA   row separators

--accent          #0D6B66   deep teal — buttons, hands-on time
--accent-text     #0D6B66   5.4:1 — passes AA at any size as-is
--accent-fg       #EFF9F8   text on teal

--amber           #B45309   copper — passive time, warnings
--amber-text      #8F4207   4.6:1 base is fills-only; this for small text

--green           #0D6B66   reuses accent
--red             #B3261E   destructive

--ink             #10292A   primary text
--ink-2           #5A706F   secondary text
--ink-3           #879A99   tertiary, labels
--ink-4           #9CACAB   disabled, inactive tabs
```

Teal and copper is oxidised copper — the pairing has a physical logic. The one theme here whose accent already clears AA at any size, so `--accent-text` is unchanged from `--accent`. Note the "amber" slot is filled with copper, not an amber hue — the token name is semantic (§4.1, rule 4), not literal.

#### Clay

```
--bg              #F5F1EC   warm stone
--surface         #FDFBF9   cards, tab bar
--surface-warm    #EDE7E0   macro tiles, emoji photo tiles
--chip-bg         #E9E2DA   inactive chips
--border          #E4DCD3   hairlines
--border-strong   #E8E1D9   row separators

--accent          #8A5A44   muted clay-brown — buttons, hands-on time
--accent-text     #6E4736   5.7:1 — text-safe variant
--accent-fg       #F8F3EE   text on clay

--amber           #7A8B6F   sage-grey — passive time, warnings
--amber-text      #56634E   text-safe sage

--green           #7A8B6F   reuses amber slot
--red             #9C4A3C   destructive, kept in-family rather than a stock red

--ink             #302A24   primary text
--ink-2           #7C7168   secondary text
--ink-3           #A69A8E   tertiary, labels
--ink-4           #B5AAA0   disabled, inactive tabs
```

Warm without a drop of orange — where Hearth and Ember both live. Quiet, desaturated, grown-up.

#### Risograph

```
--bg              #FFFDF6   warm paper
--surface         #FFFFFF   cards, tab bar
--surface-warm    #FFF3F7   macro tiles, emoji photo tiles
--chip-bg         #FFFFFF   inactive chips (bordered, see structural note)
--border          #191919   hairlines — hard black, not a hairline grey
--border-strong   #E2E0D8   row separators (softer, ingredient rows only)

--accent          #FF4F79   hot pink — buttons, hands-on time
--accent-text     #D62D5B   5.1:1 — text-safe variant
--accent-fg       #FFFFFF   text on pink

--amber           #2C6BED   electric blue — passive time, warnings
--amber-text      #1A4FC4   text-safe blue

--green           #1E8A5F   success
--red             #D62D5B   reuses accent-text

--ink             #191919   primary text
--ink-2           #5C5C5C   secondary text
--ink-3           #9C9C9C   tertiary, labels
--ink-4           #BEBEBE   disabled, inactive tabs
```

**Structural note:** Risograph is the one theme where `--border` isn't a subtle hairline — it's a deliberate 1.5–2px solid black, part of the zine-print identity (card outlines, offset shadows on primary buttons). Components reading `--border` for a hard outline and `--border-strong` for a soft one should still work unmodified, but this theme is the edge case worth testing first when the token system is built, since it's the one that stretches "hairline" furthest from its literal meaning. It's also the one theme where the "amber" slot is filled with blue rather than any warm hue — again, semantic not literal.

#### Midnight Kitchen

```
--bg              #14161C   near-black slate
--surface         #1A1D25   cards, tab bar surface (tab bar itself uses #0F1116, see note)
--surface-warm    #1A1D25   macro tiles, emoji photo tiles
--chip-bg         #1F232C   inactive chips
--border          #232733   hairlines
--border-strong   #232733   row separators

--accent          #4ADE80   mint green — buttons, hands-on time
--accent-text     #2FAE5E   4.6:1 on bg at small sizes; #4ADE80 itself is fill-only
--accent-fg       #06240F   text on mint

--amber           #3B4657   slate-blue — passive time, warnings
--amber-text      #8891A3   --ink-2 doubles as the text-safe variant here

--green           #4ADE80   reuses accent
--red             #FBBF24   amber-toned warning rather than a saturated red, to avoid two competing alarms on a dark ground

--ink             #E8EAEF   primary text
--ink-2           #8891A3   secondary text
--ink-3           #6B7484   tertiary, labels
--ink-4           #5A6273   disabled, inactive tabs
```

**Note:** the tab bar itself is `#0F1116`, one step darker than `--surface`, for visual separation from content — the only theme where the tab bar isn't literally `--surface`. Handle as a `tabBarBg` token if the component needs it distinctly, defaulting to `--surface` in every other theme.

Dark-first, not a dark-mode derivative — designed as its own thing. Zero glare at 7pm; mint is sharp enough to read clearly against slate. Replaces the placeholder "Slate & Fig" dark mode from earlier drafts.

#### Dusk

```
--bg              #1B1A22   charcoal-violet
--surface         #222129   cards, tab bar surface (tab bar itself uses #151419, see note)
--surface-warm    #26252F   macro tiles, emoji photo tiles
--chip-bg         #26252F   inactive chips
--border          #2A2934   hairlines
--border-strong   #2A2934   row separators

--accent          #F2A65A   apricot — buttons, hands-on time
--accent-text     #F2A65A   4.9:1 on bg — clears AA as-is
--accent-fg       #2A1A08   text on apricot

--amber           #5B7B9A   dusty blue — passive time, warnings
--amber-text      #8FA9C0   lighter tint for small text on dark ground

--green           #7FA96B   success
--red             #E8646A   softened red, sits more comfortably on a violet ground than a pure red

--ink             #E6E3ED   primary text
--ink-2           #918CA3   secondary text
--ink-3           #726D85   tertiary, labels
--ink-4           #605B72   disabled, inactive tabs
```

**Note:** same tab-bar pattern as Midnight Kitchen — `#151419` is one step darker than `--surface` for separation.

Softer and warmer than Midnight Kitchen — apricot and dusty blue read as evening rather than technical. The second dark option, for anyone who finds mint-on-slate too clinical.

### 4.4 Category colours (calendar, tags)

Per-theme, since they must sit legibly on that theme's background. Same seven categories throughout: chicken, beef, pork, fish, veg, lamb, other.

**Hearth:**
```
chicken #E8A33D   beef #A33B2A   pork #D6837E
fish    #4A8CA8   veg  #6B8F5E   lamb #8B4A5C   other #9B8264
```

**Ember:**
```
chicken #F5A623   beef #B03D14   pork #E0958A
fish    #4A8CA8   veg  #5C8A3C   lamb #9A5266   other #A88860
```

**Seaglass:**
```
chicken #C77D11   beef #A33B2A   pork #C4746E
fish    #2E7D96   veg  #3E7D4F   lamb #8B4A5C   other #7C8B95
```

**Clay:**
```
chicken #B8791E   beef #9C4A3C   pork #C08478
fish    #4E7A88   veg  #7A8B6F   lamb #8A5A6E   other #9C8E7E
```

**Risograph:**
```
chicken #FFB020   beef #FF4F79   pork #FF9EBB
fish    #2C6BED   veg  #1E8A5F   lamb #B057E0   other #5C5C5C
```

**Midnight Kitchen:**
```
chicken #E9B949   beef #E8646A   pork #E0A0A6
fish    #5B9BD5   veg  #4ADE80   lamb #B084D6   other #8891A3
```

**Dusk:**
```
chicken #F2A65A   beef #E8646A   pork #E0A9AA
fish    #5B7B9A   veg  #7FA96B   lamb #B58AC7   other #918CA3
```

Chosen per-theme for distinctness at 12px dot size, not realism — a dot legible on Hearth's cream is not automatically legible on Midnight Kitchen's slate.

### 4.5 Typography

Shared across all themes — type is not themed.

| Role | Face | Usage |
| --- | --- | --- |
| Display | Fraunces (600/700) | Recipe names, screen titles |
| Body | Public Sans (400/500/600/700) | Everything else |
| Data | IBM Plex Mono (500/600) | Quantities, timers, macros, counts |

Rationale: Fraunces carries cookbook warmth without tipping into pastiche and reads comfortably across all seven palettes, warm or cool, light or dark; Public Sans stays legible at small sizes under bad kitchen light; monospace for numbers means quantities align in a column and timers don't jitter as digits change width.

**Exception:** Risograph's chips and body labels may read better in a print-adjacent face (Karla, in the original mockup). If this divergence is kept, it's the one theme allowed a body-face override, declared on the `Theme` object as an optional `bodyFaceOverride`, not a silent exception.

### 4.6 Scale and spacing

```
Type:    11 / 12.5 / 14 / 16 / 20 / 24 / 32 / 44 (Cooking Mode)
Space:   4 / 8 / 12 / 16 / 18 / 24 / 32
Radius:  6 (chips) / 10 (tiles) / 13 (cards, buttons) / 20 (pills)
```

Risograph's card borders and offset shadows (§4.3) are additive to this scale, not a replacement for it.

**Breathing room, as a standing rule.** A cluster of labels, chips, and inputs stacked with only `xs`/`sm` gaps between every element reads as noise, not information — this has bitten Cooking Mode's log editor and the substitutions form once already. When a group has more than two distinct row-types stacked vertically (a label, a chip row, an input, another label, …), each row-type gets its own visual separation, not just uniform `xs` spacing:

- A section label (e.g. "Substitutions", "Photos") is bold (`fonts.body.bold` or `fonts.display.semiBold`, never `semiBold` body at a small size) and carries `spacing.md`–`spacing.lg` above it, separating it from the previous section rather than just the next control.
- A card or grouped-control cluster (a substitution row, a form) gets its own background distinct from both the page and its inputs — never the same token as the chip fill it contains, or the chip disappears into the card. Prefer `surface` for the card and `bg` for text inputs inside it (or vice versa), never `surfaceWarm` for both card and chip.
- Text inputs get a visible border (`borderStrong`, not `border`) and internal padding of at least `spacing.sm` vertical / `spacing.base` horizontal — a hairline border with no fill is easy to miss as an editable field.
- Rows of chips get `spacing.sm` between chips, not `spacing.xs` — `xs` is for chips that are variants of the same choice (e.g. star rating), not independent options.

This isn't a new token — it's a discipline about which existing tokens to reach for when a section has several kinds of content stacked together, so a themed screen doesn't need a second pass once it's built to stop reading as cluttered.

**Keyboard avoidance, as a standing rule.** Every screen with a `TextInput` wraps its scrollable content in `KeyboardAvoidingView` with `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}`, and the inner `ScrollView` gets `keyboardShouldPersistTaps="handled"`. A prior custom `useKeyboardAwareScroll` hook (ref-measure-and-scroll-on-focus) was tried first and removed — it was unreliable across screens. This is the same pattern as the Memento/travel-companion sibling project. No per-input wiring (no refs, no `onFocus` handlers) — the `KeyboardAvoidingView` alone at the top of each screen/modal handles it. Any new input added to the app needs to live inside one of these wrappers before it ships.

### 4.7 Signature element — the time split bar

The one thing no other recipe app shows. A two-tone bar directly under the recipe title, splitting total time into hands-on (`--accent`) and passive (`--amber`), with a plain-language key beneath.

```
TIME                                    32 MIN
████████████░░░░░░░░░░░░░░░░░░░░
■ 14m hands-on    ■ 18m simmering
```

It answers the question people actually have — *how much of my evening does this cost?* — which "32 min" alone never does. It appears on the recipe screen, the list rows, and the Cooking Mode header.

**This is the element that stress-tests a theme.** `--accent` and `--amber` must be distinguishable at 9px height, from three feet, in bright light. Checked across all seven:

| Theme | --accent | --amber | Distinguishable? |
| --- | --- | --- | --- |
| Hearth | terracotta | amber | Yes — warm/warm but different enough in value |
| Ember | orange | marigold | Yes, marginal — closest pairing in the set, worth a squint test on-device |
| Seaglass | teal | copper | Yes — strongest pairing, different hues entirely |
| Clay | clay-brown | sage-grey | Yes — different hues, both muted |
| Risograph | hot pink | electric blue | Yes — maximum separation |
| Midnight Kitchen | mint | slate-blue | Yes — high contrast against dark ground |
| Dusk | apricot | dusty blue | Yes — warm/cool split reads clearly |

Ember is flagged because both tones sit in the same warm-orange family; it's the one theme worth an explicit on-device check once built, not just a contrast-ratio calculation.

### 4.8 Emoji photo tiles

> **Superseded at card/hero sizes by the redesign's `<RecipePhoto>` and category-tinted fallback tile (redesign spec R4).** The plain `--surface-warm` emoji tile below still applies to small inline uses (e.g. a 36px leftovers row); at ≥ ~88px surfaces the fallback is a gradient tinted from the recipe's category colour (§4.4) with the emoji centred on top — deliberate and themed, not a flat box. Real photos (`photo_uri`, §2.3) lead wherever present.

Until a recipe has a real photo, its `photo_emoji` renders as the thumbnail and hero: the emoji at large size (list rows ~28px, detail hero ~64px), centred on a `--surface-warm` tile with the standard tile radius. Deliberate and warm, not a broken-image placeholder. Every seeded recipe carries a hand-picked, dish-appropriate emoji (§9.1); user recipes default to 🍽️ and the emoji is editable in the recipe form. Renders correctly in all seven themes since it only depends on `--surface-warm`, which every theme defines.

### 4.9 Theme roster

| id | Name | Mode | Status |
| --- | --- | --- | --- |
| `hearth` | Hearth | light | **Default** |
| `ember` | Ember | light | Shipped |
| `seaglass` | Seaglass | light | Shipped |
| `clay` | Clay | light | Shipped |
| `risograph` | Risograph | light | Shipped |
| `midnightKitchen` | Midnight Kitchen | dark | Shipped |
| `dusk` | Dusk | dark | Shipped |

All seven pinned in §4.3 — nothing left open for this roster. Two dark options ship (Midnight Kitchen, Dusk), covering both a technical-cool and a warm-evening dark preference. Replaces the earlier "Slate & Fig" placeholder entirely.

The architecture is roster-agnostic beyond these seven: adding an eighth theme is one entry in the `themes` record plus one row in the picker grid. No structural work.

### 4.10 Theme picker

Settings → Theme. **Two steps: browse, then preview before committing.**

**Step 1 — grid.** Every theme as a small card, tap to open its preview.

```
┌─────────────────────────────────┐
│  ← Theme                        │
│                                 │
│  ┌─────────┐  ┌─────────┐       │
│  │▓▓▓▓░░░░ │  │▓▓▓▓░░░░ │       │
│  │ Hearth  │  │ Ember   │       │
│  │ ● active│  │         │       │
│  └─────────┘  └─────────┘       │
│  ┌─────────┐  ┌─────────┐       │
│  │▓▓▓▓░░░░ │  │▓▓▓▓░░░░ │       │
│  │ Seaglass│  │ Clay    │       │
│  └─────────┘  └─────────┘       │
│  ┌─────────┐  ┌─────────┐       │
│  │▓▓▓▓░░░░ │  │▓▓▓▓░░░░ │       │
│  │Risograph│  │Midnight │       │
│  └─────────┘  └─────────┘       │
│  ┌─────────┐                    │
│  │▓▓▓▓░░░░ │                    │
│  │ Dusk    │                    │
│  └─────────┘                    │
└─────────────────────────────────┘
```

Each card shows a miniature time-split bar in that theme's `--accent`/`--amber` — the one element that actually differentiates them (§4.7) — plus the theme name and an "active" marker on the current selection. Tapping a card, including the active one, opens its full preview.

**Step 2 — full preview.** Not a swatch strip: **the actual recipe detail screen (§5.5), rendered live in the tapped theme**, so the decision is made against real content — the time split bar, ingredient rows, macro tiles, the primary button — not an abstraction of it.

```
┌─────────────────────────────────┐
│  ← Back              Seaglass   │
│                                 │
│  🍛  Thai Green Curry           │
│      Weeknight staple.          │
│                                 │
│  ★4.5  Chicken  Cooked 7×  Hob  │
│                                 │
│  TIME                    32 MIN │
│  ██████████░░░░░░░░░░░░░░░░░░░  │
│  ■ 14m hands-on ■ 18m simmering │
│                                 │
│  INGREDIENTS           [2] 4  6 │
│  Chicken thigh            400 g │
│  Coconut milk             400 ml│
│  Green curry paste        3 tbsp│
│                                 │
│  612 kcal  38g P  21g C  41g F  │
│                                 │
│  ┌───────────────────────────┐  │
│  │     Start cooking         │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │      Apply theme          │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

The preview uses a fixed sample recipe (the same Thai Green Curry used throughout this spec's mockups, shown here with its emoji tile per §4.8), not the person's own data — consistent content across themes makes the comparison fair, and it works even on a fresh install before any real recipe exists.

**Apply theme** writes the `theme` setting (§2.3), closes back to Settings, and the whole app reflects the change immediately — no animation, no restart, per §4.1. **Back** returns to the grid with no change made. Nothing commits from Step 1 alone; a tap on a card is always "show me," never "set this."

## 5. Screens

> **Screen *layouts* are redesigned in `dishision-visual-redesign-spec.md` (R6).** Everything in §5 below remains authoritative for **behaviour, state, and data flow** — nothing here changes. The redesign restyles the presentation: each screen opens with one editorial photo-led hero, cards float with soft shadows, recipes lead with real photos (or a gradient fallback), and **all horizontal scrolling is replaced with wrapping** (R7). Read the matching R6 subsection alongside each screen: Home → R6.1, Recipes → R6.2, Recipe detail → R6.3, Plan → R6.4, Cook log → R6.5, Me/Profile → R6.6.

### 5.1 Navigation

```
┌────────────────────────────────────────────┐
│  Home    Recipes    Plan    Cook log   Me  │
└────────────────────────────────────────────┘
```

| Tab | Contains |
| --- | --- |
| **Home** | Today: plan → leftovers → recommendations → "I'm feeling…" |
| **Recipes** | List, search, sort, filter, exclusions, add recipe |
| **Plan** | Calendar, meal planning, shopping list, pantry, staples |
| **Cook log** | Cook history, filterable, log editing |
| **Me** | Stats, settings, backup |

### 5.2 Home

```
┌─────────────────────────────────┐
│  Thursday 16 July               │
│                                 │
│  ┌───────────────────────────┐  │
│  │ PLANNED · DINNER          │  │  ← only if a plan exists
│  │ Thai Green Curry          │  │
│  │ 32 min · 14m hands-on     │  │
│  │ [ Start cooking ]         │  │
│  └───────────────────────────┘  │
│                                 │
│  ▸ 2 servings of chilli left    │  ← leftovers strip, if any
│    [ Eat ]  [ Bin it ]          │
│                                 │
│  OR TRY SOMETHING ELSE          │
│  ┌───────────────────────────┐  │
│  │  🍛                        │  │  ← #1 rec, dominant card
│  │  Chicken Katsu            │  │
│  │  ★4.5 · 40 min · 6 wks ago│  │
│  └───────────────────────────┘  │
│  ┌─────────────┐ ┌───────────┐  │
│  │ Beef Chilli │ │ Salmon    │  │  ← #2, #3 half-width
│  └─────────────┘ └───────────┘  │
│                                 │
│  I'M FEELING…                   │
│  [Quick] [Healthy] [Comfort]    │
│  [High protein] [Cheap] [Have]  │
└─────────────────────────────────┘
```

Hierarchy: plan wins, recommendations sit below as alternatives, leftovers inform but never suppress.

**Leftovers strip:** backed by `leftover` rows (§5.7), newest first. **Eat** asks how many servings and decrements `servings_remaining`; reaching zero deletes the row. **Bin it** deletes the row after confirmation. A leftover past its `expires_at` simply stops appearing — no alert, no guilt, per the no-nagging principle. Expired rows are garbage-collected on app open.

If no plan exists, recommendations take the top slot with no "or try something else" header.

### 5.3 "I'm feeling…" picker

Not a mood log — nothing is stored. A filter sheet over the recommendation engine.

**Chips (fixed set):**

| Chip | Rule |
| --- | --- |
| Quick | total_time < 20 min |
| Healthy | tag healthy |
| Comfort food | tag comfort |
| High protein | protein_per_serving ≥ 30g |
| Chicken / Beef / Fish / Veg | protein tag |
| Cheap | cost_per_serving < cached median (§6.8) across recipes with cost data |
| Uses what I have | see rule below |
| Low effort | active_time < 15 min |

**"Uses what I have" — precise rule:** every ingredient that is *not* a staple and *not* marked `optional` must be satisfiable from the pantry. Measurable ingredients require the scaled base-unit quantity to be present; **unmeasured** ingredients (§3.2) are satisfied by the mere existence of a pantry row at any quantity. Optional ingredients never block the chip.

**Behaviour:**

- Multi-select, AND logic
- Live match count updates as chips toggle: "8 matches"
- Filter is hard — non-matching recipes excluded
- **Relax rule:** if fewer than 3 recipes survive, backfill to 3 from the boost pool and mark each backfill visibly: *"Closest match — 24 min, not under 20"*
- A chip whose data is under-populated is **greyed with a reason**: *"Add costs to 12 recipes first"*
- Threshold: chip enabled when ≥ 60% of non-excluded recipes have the required data

**Shared engine:** the Recipes tab filter and this picker compile to the same query object. One filter engine, two entry points.

### 5.4 Recipes

List rows: photo/emoji tile, name, one-line description, time split bar, rating, times cooked.

**Sort:** name · rating · times cooked · last cooked · total time · hands-on time · cost per serving · calories · date added

**Filter:** the same chip set as "I'm feeling…", plus tags, plus equipment.

**Search:** name + ingredients + description + **my log notes**. Log-note matches are labelled distinctly — *"matched in your notes: 'too salty'"* — because a hit with no visible cause reads as a bug. Search is local-only; notes never leave the device.

**Exclusions view:** accessible from the filter bar. Two sections — Never again (permanent) and Not tonight (expiring). Un-exclude on each row.

### 5.5 Recipe detail

```
┌─────────────────────────────────┐
│ ┌────┐  Thai Green Curry        │
│ │ 🍛 │  Weeknight staple.       │
│ └────┘                          │
│                                 │
│ ★4.5  Chicken  Cooked 7×  Hob   │
│                                 │
│ TIME                    32 MIN  │
│ ██████████░░░░░░░░░░░░░░░░░░░   │
│ ■ 14m hands-on ■ 18m simmering  │
│                                 │
│ INGREDIENTS      [2] 4  6  8  ⋯ │
│ You have 6 of 8                 │
│ ● Chicken thigh          400 g  │  ← ● = in pantry
│ ● Coconut milk           400 ml │
│ ○ Green curry paste      3 tbsp │
│ ● Thai basil        1 handful   │
│                                 │
│ 612 kcal  38g P  21g C  41g F   │
│ ⚠ From 9 of 11 ingredients      │
│ ~€4.20 per serving              │
│                                 │
│ PREP · 3 steps                  │
│ COOK · 6 steps                  │
│ [ timeline preview bar chart ]  │
│                                 │
│ ┌───────────────────────────┐   │
│ │     Start cooking         │   │
│ └───────────────────────────┘   │
│  I already cooked this          │
└─────────────────────────────────┘
```

Pantry presence shown two ways: a header line ("You have 6 of 8") and a dot per ingredient.

### 5.6 Cooking Mode

**Entry:** Start cooking → if an unfinished session exists for this recipe, offer **Resume** or **Start over**. Sessions older than 12 hours offer only Start over.

**Prep phase:** untimed by default — a checklist, tap to tick. If steps define durations, it runs timed like the cook phase. A subtle progress indicator ticks up.

**Cook phase:**

```
┌─────────────────────────────────┐
│ ▓▓▓▓▓▓▓▓▓░░░░░░░░  12:04 / 32:00│
│                    ⚠ 4 min behind│
│                                 │
│                                 │
│   Add the curry paste and       │  ← 44px, dominant
│   fry until fragrant            │
│                                 │
│   ▶ 2:00                        │  ← step timer
│                                 │
│   ─────────────────────────     │
│   NEXT · Pour in coconut milk   │  ← peek
│                                 │
│  [ ⏸ ]  [ ← ]  [ → ]  [ ☰ ]     │
│                                 │
│  ┌───────────────────────────┐  │
│  │      Complete             │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

**Clock behaviour:**

- One master clock drives everything. Steps auto-advance on start_offset_seconds.
- **Sequential timelines:** for `timeline_mode='sequential'`, `start_offset_seconds` is **derived at read time** as the cumulative sum of prior steps' durations in sort order (untimed steps contribute 0) — never authored, never stored. Authored offsets are a `parallel`-mode concept.
- Tap ← / → to move manually at any time.
- Falling behind: the app shows ⚠ 4 min behind, shifts the ETA and all **unstarted** steps forward by the drift.
- **Steps already running keep their real end times.** A pot that has been simmering for 12 minutes does not care that you are behind. Only future steps slide.
- No dependency modelling, no clash warnings. The app reports drift and leaves the judgement to the cook.
- **Persistence is event-driven** (§2.3): pause, resume, step advance, drift recalc, app background. Never per-tick.

**Alerts — foreground:** vibrate + sound + full-screen takeover showing the next step. Fire on every passive step finishing and every step flagged important. All three independently toggleable in settings.

**Alerts — backgrounded or locked:** the phone leaves the app mid-simmer; the simmer does not care. Cooking Mode uses **local scheduled notifications** (expo-notifications — the only permitted use, §1.2):

- When a passive or important step **starts**, schedule a local notification for that step's end time.
- Cancel and reschedule the affected notifications on: pause (cancel all), resume (reschedule, shifted), manual step advance (cancel that step's), drift recalculation (reschedule unstarted steps' by the shift), Complete or session exit (cancel all).
- Notification permission is requested on **first Cooking Mode entry**, with one line of context: *"So the timer can reach you when the app's in your pocket."* Denied → foreground-only alerts plus a one-time, dismissible note. Never re-prompted.
- Nothing outside an active cooking session may schedule a notification. Ever.

**Always:** keep-awake on, screen never dims, ☰ opens the full step list.

**Layout note (§1.3):** this screen hides the tab bar and claims the full viewport, so it owns responsibility for its own bottom clearance. The control row ([⏸][←][→][☰]) and the Complete/Exit buttons must be padded by `useSafeAreaInsets().bottom`, not a fixed margin — with the tab bar hidden there is nothing else reserving that space, and a fixed value that looks right on the 12 Lite sits under the 13T's gesture bar (or vice versa). The all-steps (☰) modal is a bottom sheet — it must stay vertically centred and scrollable within its own bounds regardless of step count, not grow off-screen.

**Complete** → consumption summary → cook log prompt.

### 5.7 Cook complete

```
┌─────────────────────────────────┐
│  Cooked Thai Green Curry        │
│  32 min · 7th time              │
│                                 │
│  HOW MANY SERVINGS?             │
│  Made [4]   Eaten [2]           │
│  ▸ 2 servings of leftovers      │
│    keep until Sun 19 [edit]     │
│                                 │
│  USED FROM YOUR PANTRY          │
│  Chicken thigh    400 g  [edit] │
│  Coconut milk     400 ml [edit] │
│  Thai basil       ⚠ ran short   │
│    → added to shopping list     │
│                                 │
│  RATE IT?                       │
│  ☆ ☆ ☆ ☆ ☆        [ Skip ]      │
│                                 │
│  [ Done ]   [ Write a log now ] │
└─────────────────────────────────┘
```

Everything on this screen is optional and skippable.

**Leftover rule:** when made > eaten, a `leftover` row is created: `servings_remaining = made − eaten`, `expires_at = cooked_at + 3 days` (editable inline here, and later from the Home strip). Editing made/eaten before commit adjusts or removes it. Leftovers surface on Home (§5.2) until eaten, binned, or quietly expired.

**Consumption rules:**

- Deduct each ingredient's scaled base-unit quantity from pantry_item
- Deduct to zero, delete the row, and **add to the shopping list** — but **only when the shortfall is real**, i.e. a pantry row existed and was insufficient. An ingredient the pantry never knew about is not a shortfall and must not be auto-added, or every cook dumps half the recipe onto the list.
- **Auto-add is a preference:** gated by the `auto_add_shortfalls` setting — **on by default**, toggleable in settings (§5.10). When off, the shortfall line still appears (⚠ ran short) with a manual **[ Add to list ]** button instead of the automatic add. The real-shortfall rule applies in both modes; the toggle only gates the automatic insertion.
- Every deduction writes a pantry_movement row
- The summary is editable before it commits

### 5.8 Plan

**Calendar:** month view, day cells coloured by a category of your choosing (protein / duration / tag). Two layers per day — **planned** meals as outlines, **cooked** meals as filled dots. No linkage between them; plan and reality are independent. Multiple meals per day supported.

Tapping a day → sheet listing planned and cooked meals for that day, with entry points to log, edit, or plan.

**Planning:** default view is a week. planned_meal holds recipe + date + slot + servings.

**Shopping list:** generated from a date range (defaults to the visible week). Consolidates by canonical_id — two recipes needing onion produce one line, converted to base units before summing. Generated lines are **pack-rounded** (§3.5). Staples excluded unless flagged running_low. Manual items can be added.

**The list is fully editable.** Generation is a one-time act; after that the list is plain data. Every line — generated or manual — supports editing quantity, unit, and display name, deletion, and drag reordering. Generating again creates a **new** list rather than mutating an edited one; a user's edits are never silently regenerated away.

Checking an item off → pantry_item += quantity (the purchase quantity, §3.5), pantry_movement row written. Unchecking within the same list reverses it.

**Pantry:** the pool. Auto-populated from shopping check-offs, drained by cooking, fully editable by hand. No expiry — items persist until consumed or removed. A manual edit screen is essential, because the pool has no other way to learn you binned the wilted spinach.

**Staples:** the always-have list. Excluded from shopping lists; running_low flag forces one back on.

### 5.9 Cook log

Filterable, sortable list of every cook. Filter by recipe, date range, rating, tag. Sort by date or rating.

Tap a cook → log editor:

| Field | Type |
| --- | --- |
| Stars | 1–5, optional |
| Quick tags | multi-select: too salty · perfect · too slow · too bland · would repeat · too much effort |
| What went well | free text |
| What to change | free text |
| Notes | free text |
| Photos | multiple, compressed |
| Substitutions | structured: original → replacement, verdict, **promote to recipe** |

**Promote to recipe:** rewrites recipe_ingredient permanently. The cook_log_substitution row keeps original_text as a snapshot, so old logs stay self-describing regardless of what the recipe says now. **No recipe versioning** — the recipe is "how I make it today", the log is "what I made that night."

**Photos:** multi-select from the library in one picker call, each photo through the unconditional §8 pipeline. Thumbnails in the editor are large enough to actually recognise the dish (not a 72px chip). Tapping a thumbnail (not its remove badge) opens a full-screen **PhotoViewer**: pinch/double-tap to zoom, pan while zoomed, swipe down to dismiss, prev/next arrows when the log has more than one photo. This is a deliberate, narrow exception to §15's "no hex literals" rule — the viewer's backdrop and chrome are fixed near-black/white regardless of the active theme, the same convention every photo-viewing surface uses (a themed light backdrop would fight the photo, not frame it). Built on react-native-gesture-handler + react-native-reanimated (§15.1).

### 5.10 Me

```
┌─────────────────────────────────┐
│         ┌───────┐               │
│         │  🍜   │               │  ← avatar: photo or emoji
│         └───────┘               │
│           Lema                  │
│                                 │
│  MY FAVOURITES                  │
│  ● Thai Green Curry             │
│  ● Chicken Katsu                │
│  ● Beef Chilli                  │
│                    [ View all ] │
│                                 │
│  HOUSEHOLD                 (1)  │
│  ┌───────────────────────────┐  │
│  │ 🥑 Tara      synced 2d ago │  │
│  └───────────────────────────┘  │
│  [ + Add person ]               │
│                                 │
│  STATS                       ▸  │
│  SETTINGS                    ▸  │
│  DEBUG                       ▸  │  ← only when debug mode on
└─────────────────────────────────┘
```

**Profile:**

- display_name — free text, editable
- Avatar — pick from photo library (same compression pipeline, §8), or the assigned emoji
- **Default avatar:** a random food emoji assigned at first run from a fixed pool of ~20 food glyphs (🍜 🥘 🍲 🥗 🍳 🌮 🍕 🥐 🍛 🥙 🍝 🥧 🧀 🥑 🍤 🍚 🥞 🍔 🍋 🫑), stored in profile.avatar_emoji. Re-rollable.
- Favourites: top 5 by date added, View all → Recipes tab pre-filtered to favourites

**Stats:**

- Counts: total cooks, distinct recipes, most-cooked, **"cooked 18 of the last 30 days"** (no streaks — a broken streak turns a pleasant habit into a debt)
- Trends: cooks per week, rating drift over time, protein/cuisine distribution
- Nutrition: average kcal and macros per week
- Money: spend per week, cost-per-serving trend

**Settings:**

- **Theme** — picker (§4.10), defaults to Hearth, seven shipped (§4.9)
- Recommendation weight sliders (§6.1)
- **Recency window** — days to exclude recently cooked recipes (0–30, default 5)
- Default serving size
- Cooking Mode alerts: vibrate · sound · takeover, independent toggles
- **Auto-add shortfalls to shopping list** — toggle, **on by default** (§5.7)
- **Currency** — code + symbol (default EUR / €). **Display-only**: it formats every cost in the app; it performs no conversion and rescales nothing. Changing it is a relabel, useful when the household moves countries.
- Staples management
- Cost staleness threshold (60 / 90 / 180 / never)
- **Debug mode** — toggle, reveals the Debug screen (§12)
- Backup & export

### 5.11 Household

```
┌─────────────────────────────────┐
│  ← Household                    │
│                                 │
│  ┌───────────────────────────┐  │
│  │ 🥑 Tara                    │  │
│  │     synced 2 days ago     │  │
│  │     12 public recipes     │  │
│  └───────────────────────────┘  │
│                                 │
│  [ + Add person ]               │
│                                 │
│  ─────────────────────────────  │
│  Recipes are private by default.│
│  8 of your 47 are public.       │
│  [ Manage visibility ]          │
└─────────────────────────────────┘
```

**Adding a person:**

QR primary, pairing code as fallback.

```
Phone A: [ Add person ] → shows QR + "192.168.1.24 · code 481923"
Phone B: [ Add person ] → [ Scan ] or [ Enter address + code ]
         ↓
Both on same WiFi → authenticated handshake → exchange profile + public recipes
         ↓
household_member row on both sides
```

The QR carries `person_id`, `display_name`, the local network `address:port`, and the freshly minted `sync_secret` (§7.5). The code fallback shows the address and a 6-digit code on Phone A's screen; Phone B enters both, and the secret is exchanged over the resulting connection after the code verifies. The handshake is a direct phone-to-phone connection on the local network — no server, no internet.

**Removing a person:**

Removal is **local and immediate**: sets removed_at, cascades the recipe cache and ratings away.

A **tombstone** propagates on next contact, at which point their phone drops you too. Until then their phone shows a stale entry — this cannot be avoided offline and the spec does not pretend otherwise. The UI says so plainly: *"Tara will be removed from your household. Her phone will update next time you're both on the same network."*

Confirmation required. Deletes their cached recipes and their synced ratings from this device.

### 5.12 Member profile

```
┌─────────────────────────────────┐
│  ← Tara                         │
│         ┌───────┐               │
│         │  🥑   │               │
│         └───────┘               │
│           Tara                  │
│      synced 2 days ago          │
│                                 │
│  HER FAVOURITES                 │
│  ● Carbonara                    │
│  ● Fish Pie                     │
│  ● Shepherd's Pie               │
│  ● Pad Thai                     │
│  ● Chowder                      │
│                                 │
│  [ View all 12 recipes ]        │
│                                 │
│  [ Sync now ]                   │
│  [ Send my ratings ]            │
│  [ Remove from household ]      │
└─────────────────────────────────┘
```

**Favourites:** max 5, their is_favourite recipes ordered by favourited_at DESC. Fewer than 5 shows fewer; zero shows *"No favourites yet"*.

**View all** opens their cached library using the **same list component as the Recipes tab** — identical sort and filter options, same filter engine (§5.3), reading from household_recipe_cache instead of recipe. The list component takes a data source, not a hardcoded table. No duplicated code.

Their recipes are **read-only**. Each row has an **Import** action → runs the standard §7.3 import flow, preview and all. Imported recipes land in your library as source='imported' with their share_id intact, so subsequent diffs work.

**They never appear in your Recipes tab, recommendations, planning, or search until imported.** The cache is a browsable catalogue, not part of your library.

## 6. Recommendation engine

### 6.1 Score

Recomputed on app open, cached against the date so picks don't shuffle mid-day.

```
score = w_recency   × recency_norm
      + w_rating    × rating_norm
      + w_frequency × frequency_norm
      + w_jitter    × random()
```

**Default weights** (all tunable in settings):

```
w_recency   = 0.35
w_rating    = 0.30
w_frequency = 0.20
w_jitter    = 0.15
```

**Normalisation:**

- recency_norm = min(days_since_last_cooked ÷ 60, 1.0); never-cooked = 0.7
- rating_norm = (avg_stars − 1) ÷ 4; unrated = 0.5
- frequency_norm = times_cooked ÷ max(times_cooked across library)

### 6.2 Hard filters

Applied before scoring:

- Exclude recipe_exclusion where kind = never_again
- Exclude recipe_exclusion where kind = not_tonight and expires_at > now
- Exclude anything cooked in the last **recency_window_days** — default **5**, configurable in settings (range 0–30; 0 disables the filter)
- Exclude the same primary protein as yesterday's cook. **Primary protein** = the recipe's protein-type tag with the lowest tag_id (deterministic when a recipe carries several). Recipes with no protein-type tag are exempt from this filter, and a yesterday-cook with none disables it for today.

### 6.3 Relaxation ladder

If fewer than 3 recipes survive the window, step it down:

```
window → ⌈window/2⌉ → ⌈window/4⌉ → no recency filter
```

At the default of 5: 5 → 3 → 2 → off. At a user-set 14: 14 → 7 → 4 → off.

Each relaxation step is labelled honestly in the UI: *"You've had these recently, but the cupboard's bare."*

### 6.4 Diversity rule

The three shown picks must differ from each other on **protein tag OR duration bucket**. **Duration buckets:** under 20 min · 20–40 min · over 40 min (total time). Three chicken dishes is the indecision problem restated, not solved.

### 6.5 Degradation

When ratings are sparse (< 30% of recipes rated), w_rating collapses to 0 and its weight redistributes proportionally across recency and frequency. The engine stays useful when the cook log goes quiet.

### 6.6 Cold start

Seeded recipes enter the pool with rating_norm = 0.5 and recency_norm = 0.7, so a fresh install recommends plausible things immediately.

### 6.7 Dismissal

"Not tonight" on a recommendation → recipe_exclusion row, kind not_tonight, expires_at = now + 7 days. Upsert per the §2.3 rule: it never overwrites an existing never_again.

### 6.8 Median cost cache

The Cheap chip needs a median across the library. Computing it per query is wasteful and makes the chip's live match count sluggish.

**Cached** in setting under key median_cost_per_serving, alongside median_cost_computed_at.

**Invalidated on any of:**

- recipe insert, update, or delete
- recipe_ingredient insert, update, or delete
- canonical_ingredient.cost_per_100 change
- Bulk cost refresh (§6.9)

Invalidation sets the cached value to NULL; the next read recomputes and re-caches. Computation is over recipes with **complete** cost data only — a recipe missing costs on 3 of 11 ingredients is excluded from the median entirely rather than dragging it down with a partial figure.

Note by construction: roughly half the costed library is always "cheap". That's intended — the chip is a relative filter, not an absolute budget.

### 6.9 Cost staleness

Ingredient prices drift. canonical_ingredient.cost_updated_at exists to catch it.

**Rule:** on app open, if any canonical_ingredient has cost_updated_at older than **90 days**, show a dismissible prompt on the Me tab:

*"14 ingredient prices haven't been checked since April. Update them?"*

Tapping it opens a **cost refresh screen**: a list of stale ingredients sorted oldest-first, each with an inline price field. Updating one sets cost_updated_at = now and invalidates the median cache (§6.8).

**Constraints:**

- Prompt is dismissible and re-arms after **30 days**, not on next open. One nudge a month at most.
- Never blocks anything. Stale costs still compute; they're just flagged.
- A recipe whose ingredients include stale costs shows a subtle marker on its cost line: *"~€4.20 per serving · prices from April"*
- Threshold configurable in settings (60 / 90 / 180 days / never).

## 7. Sharing and import

### 7.1 Payload

```json
{
  "v": 1,
  "share_id": "uuid-v4",
  "recipe": {
    "name": "Thai Green Curry",
    "description": "...",
    "base_servings": 2,
    "timeline_mode": "parallel",
    "origin_label": "Nana's recipe",
    "origin_url": null,
    "photo": null,
    "photo_emoji": "🍛"
  },
  "ingredients": [
    { "display_name": "chicken thigh", "canonical_name": "chicken thigh",
      "quantity": 400, "unit": "g", "scalable": true, "optional": false }
  ],
  "lanes": [ { "name": "rice", "sort_order": 0 } ],
  "steps": [
    { "lane": "rice", "phase": "cook", "instruction": "...",
      "duration_seconds": 720, "start_offset_seconds": 0,
      "effort": "passive", "important": true }
  ],
  "tags": ["chicken", "thai", "hob"]
}
```

**Never included:** ratings, logs, favourites, cook counts, plans, pantry state, photos-by-default.

`photo`, when opted in at share time, is a base64-encoded JPEG string (already through the §8 pipeline). `photo_emoji` always travels — it's tiny and objective.

Ingredients travel with canonical_name as a string, not an ID — the recipient resolves it against their own table or creates it.

### 7.2 Transport

| Method | Condition |
| --- | --- |
| Deep link | dishision://import?d=<base64> — payload < 2 KB |
| QR code | payload < **1.2 KB** — offered only when it fits, explains why when it doesn't. (2 KB is technically valid QR but a version-40 grid is miserable to scan in kitchen light; 1.2 KB keeps scans instant.) |
| File | .dishision — always available, required for photos. Format: the §7.1 JSON, verbatim, UTF-8. |

Photos are **off by default** at share time, opt-in per share. This keeps most recipes QR-eligible, which is a pleasant accident of the constraint.

### 7.3 Import

- Parse and validate against v
- Match by share_id
- **Never write silently** — always show a preview screen first

| Match state | Behaviour |
| --- | --- |
| No match | Preview → Import as new |
| share_id match, identical | "You already have this" → no-op |
| share_id match, differs | **Diff view** — field-by-field, changed values highlighted → Merge / Keep both / Cancel |
| No share_id match, name similar | "Is this the same as your *Green Curry*?" → manual merge tool → Merge / Import as new |

**Manual merge tool:** pick two recipes from the library, confirm they're the same lineage, and one adopts the other's share_id. Handles the case where the same dish arrived twice by different routes.

Imported recipes: source = 'imported', imported_from and imported_at set. Ratings and logs are **never** imported — the recipient builds their own.

### 7.4 Household sync — scope

Distinct from §7.1–7.3. That is one recipe, deliberately shared. This is a household catalogue refresh.

| Crosses the wire | Never crosses |
| --- | --- |
| profile: person_id, display_name, avatar **emoji** | Logs, notes, photos, quick tags |
| Public recipes (full §7.1 payload) | Private recipes |
| Their is_favourite flag + favourited_at | Cook counts |
| Removal tombstones | Plans, shopping lists, pantry, staples |
| Ratings — **only via §7.6, opt-in** | Substitutions |
|  | Photo avatars — **emoji-only over sync**; a photo avatar stays on its own device and the emoji represents you remotely |

Ratings do **not** ride along with a recipe sync. They are a separate, explicit act. This preserves the principle: opinions leave the phone only when you decide they do.

### 7.5 Household sync — mechanics

**Transport:** direct phone-to-phone TCP over local WiFi, via **react-native-tcp-socket** (the one networking dependency, §15). Messages are newline-delimited JSON (NDJSON). Both phones on the same network, both with the app foregrounded. No server, no internet, no background sync, no discovery protocol — addresses are exchanged by humans holding phones next to each other.

**Roles:** the phone whose profile screen initiated contact connects out; the other phone listens on an ephemeral port opened only while its pairing/sync screen is visible. The listener closes the socket the moment the screen is left.

**Authentication:** every message after the opening `hello` carries the pair's `sync_secret` (32 random bytes, hex, minted by the QR-displaying phone at pairing and stored by both sides in household_member). A message with a missing or wrong secret → connection closed immediately, a `sync` log entry written, nothing else. The secret never changes; re-pairing mints a new one. This is deliberately modest security — it keeps out other devices on the WiFi, not nation states, and for a two-person household app that is the right amount.

**Addressing:** connect to `last_known_address` first. On success, update it (DHCP moves phones around). On failure, the UI says: *"Can't find Tara — ask her to open her Household screen and tap Show sync code."* That button displays a QR of `{person_id, current address}` (no secret — it's already shared); scanning it updates `last_known_address` and retries. If secrets mismatch (one side re-installed), offer full re-pairing.

**Trigger:** manual only — Sync now on a member's profile.

**Protocol:**

```
0. hello {person_id} → authenticated by sync_secret on every
   subsequent message; wrong secret → drop
1. Connect (last_known_address, or fresh address via Show sync code)
2. Exchange profiles       → update household_member (emoji avatars only)
3. Exchange tombstones     → if they removed me, drop them locally
4. Request their public recipe manifest: [{share_id, updated_at}]
5. Request full payloads for share_ids that are new or changed
6. Upsert household_recipe_cache on (person_id, share_id)
7. Delete cached rows whose share_id vanished from the manifest
   (they made it private or deleted it)
8. Write sync_event rows, set last_synced_at
```

**Atomicity:** steps 6–8 are staged and committed in a single SQLite transaction at the end. Any earlier step failing leaves the previous cache untouched. A half-finished sync is never committed. Errors surface plainly: *"Couldn't reach Tara's phone. Same WiFi?"*

**Conflicts:** none possible. The cache is read-only and single-authored — their phone is the sole authority on their recipes.

### 7.6 Opinion sync

Explicit, one-directional, ratings only.

**Send my ratings** on a member's profile sends {share_id, stars} for **every recipe I've marked public that I've rated** — including recipes they don't have.

- stars is the derived average of my cook_log.stars for that recipe
- No cook counts, no notes, no dates
- Recipient stores rows in household_rating keyed on (person_id, share_id)

**Orphan rule:** a rating whose share_id matches no local recipe is **not discarded**. It sits dormant in household_rating. If that recipe is ever imported, the rating attaches automatically — nothing to re-sync. This makes the sync lossless and order-independent.

**Display:** the recipe screen shows **my rating primary**. Tapping it opens a breakdown sheet:

```
┌─────────────────────────────────┐
│  Thai Green Curry               │
│                                 │
│  You          ★★★★☆   4.5       │
│  🥑 Tara      ★★★★★   5.0       │
│                 synced 12 July  │
│  ─────────────────────────────  │
│  Household average     4.75     │
└─────────────────────────────────┘
```

**Honesty rule:** every household rating displays its synced_at date. It is a snapshot, not a live value, and the UI never implies otherwise. A rating older than 60 days shows as *"synced 12 July · may be out of date"*.

The household average is derived (§2.5, including the no-self-rating fallback), never stored, and only shown when at least one household rating exists for that share_id.

## 8. Photos

Every photo — recipe hero, log photos, photo avatars — passes through the same pipeline before it touches disk.

```
capture/pick
  → resize to max 1280px on the long edge   ← ALWAYS, unconditionally
  → JPEG quality 0.7
  → write to app storage
  → store URI
```

**The resize step is unconditional.** Do not skip it when the source is already under the threshold. That exact optimisation is how photos land too large — a 900×900 image at full quality is still enormous, and the "already small enough" check only tests dimensions, never bytes.

Target: under 200 KB per photo. Log after every compression: source dimensions, source bytes, output dimensions, output bytes.

## 9. Seeded data

### 9.1 Recipes

**40+**, Irish and UK staples plus fast midweek meals and a few longer weekend cooks. The library must exercise every feature: sequential and parallel timelines, multiple lanes, active and passive steps, optional ingredients, non-scalable ingredients.

Indicative spread: shepherd's pie, bacon & cabbage, beef stew, chicken curry, spag bol, roast chicken, fish pie, carbonara, chilli con carne, stir fry, fajitas, katsu, pad thai, lasagne, sausage & mash, coddle, chowder, tray bakes, omelettes, soups.

**No photos in v1.** Every seeded recipe instead carries a hand-picked, dish-appropriate `photo_emoji` — the emoji must actually read as the dish, not a generic plate: 🥧 shepherd's pie · 🥓 bacon & cabbage · 🍲 beef stew · 🍛 chicken curry and katsu · 🍝 spag bol, carbonara and lasagne · 🍗 roast chicken · 🐟 fish pie · 🌶️ chilli con carne · 🥡 stir fry · 🌮 fajitas · 🍜 pad thai and soups · 🌭 sausage & mash · 🥘 coddle · 🍤 chowder · 🍳 omelettes. Where two dishes share an emoji, that's fine — the name disambiguates. Real photos are a post-v1 addition, sourced then heavily compressed through the §8 pipeline; when a photo lands, the emoji simply stops rendering (photo_uri wins).

### 9.2 Ingredients

**Build the ingredient table from the seeded recipes.** Every ingredient appearing in a seeded recipe gets a canonical_ingredient row with full macros, base unit, pack size, and cost. This means every seeded recipe has complete macros and cost from day one, and the two jobs collapse into one.

Estimate: ~250–350 canonical ingredients. Costs authored in EUR (the default display currency).

**This is the largest single authoring task in the project** — treat it as such (§14, sessions S2–S3): a generation script produces draft fixtures, a human verifies macros and costs. Do not let it masquerade as one afternoon.

### 9.3 Restore

Every seeded row carries a stable seed_id.

```sql
-- Restore is an upsert on seed_id. It never touches user data.
INSERT INTO recipe (seed_id, name, ...) VALUES (...)
ON CONFLICT(seed_id) DO UPDATE SET name=excluded.name, ...;
```

Rows with source = 'manual' or source = 'imported' have no seed_id and are never touched. Deleting a seeded recipe is permitted; restore brings it back.

### 9.4 Copy and tweak

Duplicate a recipe → new row, source = 'manual', seed_id = NULL, fresh share_id, name suffixed "(copy)". Fully independent from the original thereafter.

## 10. Backup and export

**Both**, per spec:

- **JSON export** — everything: recipes, logs, leftovers, ratings, favourites, plans, shopping lists, pantry, staples, household members (including sync secrets — the export is local and private), settings. Manual restore via file picker.
- **Automatic local backup** — written on app background, last 5 retained, restorable in-app.

Export format is versioned. Restore validates the version and refuses forward-incompatible files rather than half-importing.

## 11. Testing

Tests are written **alongside** each slice, not retrofitted. A slice is not done until its tests pass.

### 11.1 Stack

| Layer | Tool | Why |
| --- | --- | --- |
| Logic, engine, conversions | **Vitest** | Fast, native ESM, no transform overhead |
| DB integration | **Vitest** + better-sqlite3 in-memory | Real SQL against the real schema, no mocks |
| Component snapshots | **jest-expo** + @testing-library/react-native | Vitest can't drive the RN renderer; jest-expo is the path of least friction on SDK 54 |

Two runners is a deliberate trade: Vitest for the 90% that's pure logic (fast, watchable), jest-expo only for the snapshot suite. npm test runs both.

**Parity rule:** the test DB helper runs the same migration chain and the same PRAGMAs (`foreign_keys = ON`) as the app's DB-open helper (§2.6). A cascade that passes in tests must be the same cascade that runs on device.

### 11.2 What must be tested

**Unit — pure logic, no DB:**

- Scaling (§3.4): every rounding branch, scalable=0 passthrough, fractional countables → "1–2 eggs"
- Unit conversion (§3.2): every pair in the table, density fallback, pack_size maths, the unmeasured path
- Pack rounding (§3.5): 140g needed / 200g pack → 1 pack, 250g needed → 2 packs, no pack_size → passthrough
- Macro and cost derivation: complete data, partial data, the "9 of 11" count, zero-ingredient edge
- Recommendation score (§6.1): each normalisation, weight redistribution when ratings are sparse (§6.5)
- Relaxation ladder (§6.3): 5 → 3 → 2 → off and 14 → 7 → 4 → off, and the case where even "off" yields < 3
- Diversity rule (§6.4): three-chicken input must not produce three-chicken output; bucket boundaries at exactly 20 and 40 min
- Primary protein (§6.2): multi-protein recipe resolves deterministically; untagged recipe exempt
- Chip rules (§5.3): each predicate, the 60% enablement threshold, "Uses what I have" with optional and unmeasured ingredients
- Drift maths (§5.6): unstarted steps shift, running steps hold
- Sequential offset derivation (§5.6): cumulative sum, untimed steps contribute 0, parallel recipes untouched
- Notification schedule maths (§5.6): the pure function from (session state, steps) → set of (step_id, fire_at); pause/resume/drift each produce the correct reschedule set
- Payload build/parse (§7.1): round-trip identity, version rejection

**Integration — real SQLite:**

- Derived counts (§2.5): insert 3 logs → count 3; delete 1 → count 2. The drift-proofing claim must be a test, not a hope.
- FK enforcement (§2.6): with the standard DB helper, deleting a recipe cascades its ingredients/steps/logs; a helper opened WITHOUT the pragma would not — assert the pragma is actually set
- Seed restore (§9.3): seed → delete a seeded recipe → restore → it returns; a manual recipe is untouched across all of it
- Pantry lifecycle (§5.8): buy 1 bag spinach (200g) → cook needing 80g → pantry = 120g
- Real-shortfall rule (§5.7): pantry had 300g, needed 400g → shopping list gains it. Pantry never knew the ingredient → shopping list does **not** gain it. This is the bug the rule exists to prevent; it needs a test.
- Auto-add toggle (§5.7): same shortfall with auto_add_shortfalls off → nothing auto-added; the manual add path still works
- Leftover lifecycle (§5.7): cook made=4 eaten=2 → leftover 2; eat 1 → 1; eat 1 → row gone; separate: expired row excluded from Home query and garbage-collected
- Import diff (§7.3): share → tweak → import → diff, not duplicate
- Orphan ratings (§7.6): receive rating for absent recipe → import that recipe → rating attaches
- Median cache invalidation (§6.8): change a cost → cache nulls → next read recomputes
- Cooking session persistence (§5.6): write session → simulate kill → resume lands on the right step
- Sync auth (§7.5): a request with a wrong sync_secret is rejected and writes nothing
- Sync atomicity (§7.5): a failure at step 5 leaves household_recipe_cache byte-identical
- Household removal (§5.11): remove → cache and ratings cascade away

**Snapshot — key screens only:**

Home (with plan / without plan / with leftovers / empty library), Recipe detail (full data / partial macros / emoji tile), Cooking Mode (running / paused / behind), Member profile (5 favourites / 0 favourites), Debug screen.

Snapshots exist to catch unintended layout drift, not to specify design.

**Rendered against every theme in the roster (§4.9), not just two.** A theme that's never rendered in a test is a theme that's silently broken — this suite is the only thing that catches a hardcoded hex literal, since the bug is invisible until someone switches. Add a theme, the matrix grows automatically.

Plus a dedicated token-completeness test: every theme in the record must define every key in `ColourTokens` and `CategoryColours`. TypeScript should catch this at compile time; the test catches it if someone reaches for a cast.

### 11.3 Conventions

- Test files live under `src/test/`, mirroring the source tree: `src/scaling.ts` → `src/test/scaling.test.ts` (deviates from a colocated-test convention by explicit project decision)
- Integration tests build a fresh in-memory DB per test — no shared state, no ordering dependencies — by running the real migration chain (§2.6)
- Fixtures come from the real seed data, not hand-rolled doubles
- No mocking SQLite. A mocked DB tests the mock.

## 12. Logging & debug mode

Same pattern as Memento's debug system: Zustand store, in-memory only, toggleable UI.

### 12.1 Behaviour

- **Always capturing.** No conditional instrumentation — a log call that only fires in debug builds is a log call that isn't there when you need it.
- **Ring buffer, 2000 entries.** Oldest evicted at cap.
- **Memory only.** Nothing persists. **Every full app restart starts fresh.** To keep logs, export them.
- Debug **mode** (settings toggle) controls only whether the Debug screen is reachable — never whether capture happens.

### 12.2 Entry shape

```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogCategory =
  | 'db'      // queries, migrations, transactions
  | 'engine'  // recommendation scoring, filters, relaxation
  | 'sync'    // household handshake, transfer, tombstones, auth rejections
  | 'cook'    // session lifecycle, clock, drift, alerts, notification scheduling
  | 'pantry'  // movements, conversions, shortfalls
  | 'photo'   // compression: in/out dimensions and bytes
  | 'ui'      // render errors, boundary catches
  | 'nav'     // screen transitions
  | 'perf';   // timings

interface LogEntry {
  id: number;
  ts: string;           // ISO
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: unknown;       // rendered by JsonViewer
}
```

### 12.3 Debug screen

Reachable from Me → Debug when the toggle is on.

```
┌─────────────────────────────────┐
│  ← Debug            1,247 logs  │
│                                 │
│  [db][engine][sync][cook]       │  ← category filter chips
│  [pantry][photo][ui][nav][perf] │
│  [ debug ][ info ][ warn ][err ]│  ← level filter
│                                 │
│  ─────────────────────────────  │
│  00:48:02  engine  info         │
│  Relaxed 5d → 3d, 2 survivors   │
│  ▸ { window: 5, pool: 2 }       │  ← tap → JsonViewer
│  ─────────────────────────────  │
│  00:47:58  photo   info         │
│  1280×960 · 2.1MB → 1280×960 ·  │
│  183KB                          │
│  ─────────────────────────────  │
│  00:47:55  pantry  warn         │
│  Shortfall: chicken 300/400g    │
│                                 │
│  [ Export ]      [ Delete all ] │
└─────────────────────────────────┘
```

- **Filter by category** — multi-select chips, AND with the level filter
- **Export** → .txt via the share sheet. The only way logs survive a restart.
- **Delete all** → clears the buffer, confirmation required
- JsonViewer component for data payloads — reuse the Memento implementation

### 12.4 Mandatory log points

These are not optional instrumentation; they're the ones that pay for themselves:

| Category | Must log |
| --- | --- |
| photo | Every compression: source dims + bytes, output dims + bytes (§8) |
| pantry | Every movement, every conversion, every shortfall decision (including "auto-add off, offered manual") |
| engine | Final scores for the top 10, every relaxation step and why |
| sync | Every protocol step, every payload size, every failure with cause, every auth rejection |
| cook | Session start/resume/pause/complete, every drift recalculation, every notification scheduled/cancelled and why |
| db | Migrations, and any query over 50ms (perf) |

## 13. Build slices

Each slice ends at a working app. No slice depends on a later one.

| # | Slice | Contents |
| --- | --- | --- |
| **0** | Scaffolding | Expo SDK 54, dependency allowlist installed, Vitest + jest-expo, log store + Debug screen, CI-able npm test |
| **1** | Foundation | SQLite schema via migrations (FK pragma, WAL, user_version), theme provider + Hearth tokens, tab shell, first-run profile |
| **2** | Seed data | Generation tooling + full seeded library: ~40 recipes with emoji, ~250–350 costed ingredients |
| **3** | Recipes | List (emoji tiles), search, sort, filter, detail screen, scaling, macros, cost, manual CRUD, copy-and-tweak |
| **4** | Cooking | Cook Now → CookLog → derived counts, **leftovers (create/eat/bin/expire)**, calendar (cooked layer), "I already cooked this" |
| **5** | Cooking Mode | Session persistence, resume/start-over, master clock, drift, foreground alerts + **local notifications**, complete screen with leftover + shortfall rules |
| **6** | Recommendations | Score, filters, recency window, relaxation ladder, diversity rule, home screen (incl. leftover strip), "I'm feeling…" picker, exclusions, median cache |
| **7** | Cook log | Log editor, quick tags, photos + compression, substitutions, promote-to-recipe |
| **8** | Planning | planned_meal, calendar planned layer, week view, home plan card |
| **9** | Shopping & pantry | List generation, consolidation + pack rounding, **fully editable list**, staples, check-off → pantry, consumption on cook, **auto-add toggle**, pantry editor |
| **10** | Sharing | Payload, deep link, QR, file, preview, diff, manual merge |
| **11** | Profile & stats | Profile, avatar, favourites, stats, settings (incl. currency, auto-add), cost staleness prompt, backup/export |
| **12** | Household | Pairing with sync_secret, member list, TCP sync protocol, recipe cache, member profile, import-from-cache, removal + tombstones |
| **13** | Opinion sync | Ratings send, orphan handling, breakdown sheet, household average, staleness labels |
| **14** | Polish | Dark mode, snapshot suite, empty states |

Slice 0 exists so that logging and tests are load-bearing from the first line rather than bolted on. Slices 1–5 are a usable app. 6 makes it the app it's meant to be. 12–13 are the household layer and depend on 10's payload work.

## 14. Claude Code session plan

Sessions are sized to end at a committable state. Use the current Sonnet-class model throughout; reach for the current Opus-class model on S9 (the engine), S13 (diff/merge), and S15 (sync protocol) if the reasoning gets hairy.

**Every session writes its tests as it goes** (§11) and instruments its mandatory log points (§12.4). A session isn't done when the feature works; it's done when the tests pass and the Debug screen shows the right things happening.

**Every session begins by reading its "Read first" sections** — they carry the invariants that session must not violate. §2.6 and §15 apply to all sessions and are listed once here rather than repeated.

### S0 — Scaffolding

*Read first: §11, §12, §15 (dependency allowlist)*

- Expo SDK 54 project; install exactly the §15 allowlist, nothing else
- Vitest config for logic + DB integration; jest-expo config for snapshots; npm test runs both
- Zustand log store: ring buffer at 2000, category + level, LogEntry per §12.2
- Debug screen with category/level filters, export, delete all
- JsonViewer component (port from Memento)
- Debug mode toggle in settings
- **Verify:** log 2100 entries → buffer holds 2000, oldest evicted; export produces a .txt; restart clears

### S1 — Schema and foundation

*Read first: §2 (all of it), §4*

- SQLite via expo-sqlite; DB-open helper is the only place connections are made — sets `PRAGMA foreign_keys = ON` and WAL (§2.6)
- Migration runner on `PRAGMA user_version`; the full §2.3 DDL is migration 001 (visibility, photo_emoji, leftover, sync_secret all inline — nothing ALTERed on later)
- Theme provider, `useTheme()` hook, Hearth as the sole theme initially (remaining six land in S17); no hardcoded colours anywhere
- Tab navigator shell, five empty screens; fonts loaded (Fraunces, Public Sans, IBM Plex Mono)
- First-run: mint person_id, assign random food emoji, create profile row
- **Verify:** app boots, tabs navigate, DB has all tables, profile row exists with an emoji; an integration test proves a cascade actually cascades

### S2 — Seed tooling + first batch

*Read first: §9, §3*

- Fixture format + generation script: recipe JSON in, canonical-ingredient derivation out (§9.2)
- Seed runner, idempotent, upsert on seed_id
- Author and hand-verify the **first 10 recipes** end-to-end: lanes, offsets, effort flags, dish-appropriate photo_emoji, complete macros and EUR costs
- **Verify:** fresh install seeds 10 recipes with complete macros, costs, and emoji; re-running the seeder changes nothing

### S3 — Seed library complete

*Read first: §9*

- Remaining ~30 recipes through the S2 tooling; full canonical ingredient table (~250–350 rows)
- Library must exercise every feature: sequential and parallel timelines, multiple lanes, active/passive, optional and non-scalable ingredients
- **Verify:** 40+ recipes, zero missing macros or costs, every recipe has a non-default photo_emoji; the feature-coverage checklist passes

### S4 — Recipe read path

*Read first: §3, §4.5–4.6, §5.4–5.5*

- List rows with emoji tile and time split bar
- Detail screen, serving scaling (§3.4), macro and cost derivation, currency formatting from settings
- Partial-data flags ("9 of 11 ingredients")
- **Verify:** scale a recipe 2→6, quantities and macros track correctly

### S5 — Recipe write path

*Read first: §5.4, §9.4*

- Manual CRUD, ingredient picker with canonical resolution, emoji picker (default 🍽️)
- "Add this ingredient" flow for unmatched names
- Copy-and-tweak
- Form-based step editor: instruction, duration, offset (parallel only — sequential offsets are derived, §5.6), lane, effort, important
- Read-only timeline preview (static bar chart — the cheap 90% of the visual editor)
- **Verify:** author a parallel recipe from scratch, preview renders correctly; a sequential recipe shows derived offsets

### S6 — Search, sort, filter

*Read first: §5.3–5.4*

- One filter engine compiling to a query object
- Search across name + ingredients + description + log notes, with match-source labelling
- Every sort from §5.4
- **Verify:** filter and "I'm feeling…" produce identical results for the same chips

### S7 — Cook logging + leftovers

*Read first: §5.2 (leftovers strip), §5.7, §5.9*

- Cook Now, "I already cooked this" with date picker
- CookLog CRUD, derived counts everywhere
- Leftover model: create on made > eaten, eat (decrement), bin, 3-day default expiry (editable), silent expiry + GC on app open
- Calendar cooked layer, category colouring
- **Verify:** delete a log → count decrements and its leftover cascades; cook 4/eat 2 → leftover 2 → eat 2 → gone

### S8 — Cooking Mode

*Read first: §5.6, §1.2 (notification boundary)*

- cooking_session persistence, survives kill and restart, event-driven writes only
- Resume vs start-over, 12-hour staleness
- Master clock, auto-advance, manual override; sequential offset derivation
- Drift: shift unstarted steps and ETA only; running timers hold their real end times
- Foreground alerts (vibrate/sound/takeover, three toggles) **and** local notifications per §5.6: schedule on passive/important step start, cancel/reschedule on pause/resume/advance/drift/complete; permission on first entry with graceful fallback
- Keep-awake, 44px type, full step list sheet
- **Verify:** kill the app mid-cook, reopen, resume lands on the right step with correct elapsed; background the app during a passive step → notification fires at the right time; complete the session → no stray notifications remain

### S9 — Recommendation engine + Home

*Read first: §6 (all), §5.2–5.3*

- Score, normalisation, hard filters (incl. primary-protein rule), diversity rule with duration buckets
- Configurable recency_window_days (default 5), relaxation ladder derived from it
- Median cost cache + invalidation hooks (§6.8)
- Daily cache keyed on date
- Home screen hierarchy: plan → leftovers strip (eat/bin) → recs
- "I'm feeling…" picker, live count, relax-to-boost with visible stretch labels, precise "Uses what I have" rule
- Chip greying with reasons; exclusions view
- **Verify:** with 5 recipes and the default 5-day window, the ladder steps 5 → 3 → 2 → off and labels each step; changing a cost nulls the median cache; a leftover appears on Home and Eat decrements it

### S10 — Cook log

*Read first: §5.9, §8*

- Log editor, all fields, quick tags
- Photo pipeline (§8) — unconditional resize, log every compression
- Substitutions, promote-to-recipe
- **Verify:** a 900×900 source photo still lands under 200 KB

### S11 — Planning

*Read first: §5.8 (calendar/planning)*

- planned_meal CRUD, week view, calendar planned layer
- Home plan card
- **Verify:** plan and cooked layers render independently on the same day

### S12 — Shopping and pantry

*Read first: §3.5, §5.7 (consumption + auto-add), §5.8*

- List generation from a date range, consolidation by canonical_id, pack rounding (§3.5)
- Fully editable list: edit qty/unit/name, delete, reorder, add manual; regeneration creates a new list
- Staples exclusion, running-low
- Check-off → pantry with unit conversion (§3.2), purchase quantities; uncheck reverses
- Consumption on cook complete, editable summary; auto_add_shortfalls toggle (default on) with manual add path when off
- Pantry editor
- **Verify:** buy 1 bag spinach (200g) for an 80g need, pantry shows 200g after check-off and 120g after cooking; toggle auto-add off → shortfall offers manual add only

### S13 — Sharing

*Read first: §7.1–7.3*

- Payload build and parse, versioned; photo_emoji travels, photo opt-in as base64
- Deep link (2 KB), QR with 1.2 KB size guard, .dishision file
- Import preview, share_id diff view, manual merge tool
- **Verify:** share → tweak → reshare → import produces a diff, not a duplicate

### S14 — Profile, stats, settings, backup

*Read first: §5.10, §6.9, §10*

- Profile screen: name, avatar (photo via §8 pipeline, or emoji), re-roll emoji
- Top-5 favourites, View all → Recipes pre-filtered
- All four stat groups
- Settings: weight sliders, recency window, alert toggles, auto-add toggle, currency (code + symbol, display-only), cost threshold, debug toggle
- Cost staleness prompt (§6.9) + refresh screen, 30-day re-arm
- JSON export incl. profile, household and leftover tables, auto-backup, versioned restore
- **Verify:** export, wipe, restore → identical state including household members; switch currency to AUD → every cost relabels, no values change

### S15 — Household

*Read first: §5.11–5.12, §7.4–7.5, §15 (network constraint)*

- Recipe visibility toggle + Manage visibility screen
- react-native-tcp-socket wiring: listener bound only while the pairing/sync screen is visible; NDJSON framing
- Pairing: QR generate/scan (person_id, name, address, sync_secret), address + 6-digit code fallback; secret storage both sides
- Show sync code re-discovery flow for changed IPs; last_known_address update on every success
- Member list, add, remove with tombstone + honest "their phone updates later" copy
- Sync protocol (§7.5), all steps, auth on every message, staged writes committed in one transaction — never commit a half-sync
- household_recipe_cache upsert and orphan-row cleanup
- Member profile screen, top-5 favourites
- **View all** reuses the Recipes list component with the cache as its data source — the component takes a data source, it does not know which table it's reading
- Import-from-cache → standard §7.3 flow
- **Verify:** pair two devices, mark 3 recipes public, sync, they appear on the other phone; make one private, re-sync, it disappears from the cache; kill the network mid-sync, cache is unchanged; a connection with a wrong secret is dropped and logged

### S16 — Opinion sync

*Read first: §7.6*

- Send my ratings — all public rated recipes, {share_id, stars} only
- Receive → household_rating upsert
- Orphan rule: rating for absent recipe persists and attaches on later import
- Rating breakdown sheet: mine primary, theirs on tap, household average (with no-self-rating fallback)
- synced_at labels, 60-day staleness warning
- **Verify:** send a rating for a recipe they don't have → import it later → the rating attaches with no re-sync

### S17 — Polish

*Read first: §4.7, §11.2 (snapshot list)*

- Remaining six themes: Ember, Seaglass, Clay, Risograph, Midnight Kitchen, Dusk (§4.3 — all pinned, no design work left, just token entry)
- Theme picker: grid (§4.10 step 1) → full-preview screen rendering the real recipe detail component in the tapped theme (§4.10 step 2) → Apply
- Risograph's hard-border and body-face-override cases (§4.3, §4.5) — the two structural edge cases in the token system
- Full snapshot suite (§11.2), all seven themes
- Empty states across every screen
- **Verify:** snapshot suite green; every screen has a designed empty state

### S18 - Appearance Redesign
- Implement the dishision-visual-redesign-spec.md in it's entirety. Make sure every single screen on the app is covered so the change looks universal. Do an audit of the spec and make sure every screen is covered. If any screen is missing, add it to the spec and ask me questions to ensure that we design the screen correctly. Once I confirm that the redesign spec looks good, then you're free to make the actual changes

## 15. Constraints and conventions

Carried from Memento, plus new:

- **No hardcoded names.** Nothing assumes "Lema" or "Tara".
- **All colours from the theme object.** No hex literals in components, ever. Colour comes from `useTheme()` or it doesn't exist. This is the constraint the whole theming system rests on — a stray literal is a bug that only surfaces when someone switches theme.
- **Every theme defines every token.** No optional keys, no fallbacks, no theme-specific tokens.
- **Type is not themed.** Faces and scale are fixed across all themes.
- **Photos: unconditional resize.** See §8. Non-negotiable.
- **Counts are derived.** Never store a cook count, rating average, or streak. (`leftover` is the sole sanctioned stored-state exception — §2.5.)
- **`PRAGMA foreign_keys = ON` on every connection**, app and tests, via the single DB-open helper. No other code opens connections. (§2.6)
- **Pantry is always base units.** Convert at the boundary, never in the middle.
- **Shopping lines store purchase quantities.** Pack-rounded (§3.5); check-off adds what was bought, not what was needed.
- **Nothing writes on import without a preview.**
- **Every optional field stays optional.** No forced ratings, no forced logs, no nagging. Leftovers expire silently.
- **Auto-add is a preference.** The real-shortfall rule always applies; the `auto_add_shortfalls` toggle (default on) gates only the automatic insertion.
- **Local notifications exist only inside an active Cooking Mode session.** No other code path may schedule one. (§1.2, §5.6)
- **Recipes are private by default.** Visibility is always an explicit per-recipe act.
- **The household cache is read-only.** It never enters the library, recommendations, planning, or search until explicitly imported.
- **Opinions cross only on explicit send.** Never as a side effect of a recipe sync.
- **Every sync message is authenticated** by the pair's sync_secret; unauthenticated messages are dropped and logged. (§7.5)
- **Synced ratings always show their date.** A snapshot must never be dressed as live data.
- **Sync is atomic.** A failed sync leaves the previous state untouched.
- **The list component takes a data source.** It must not know whether it's reading recipe or household_recipe_cache.
- **Logs never persist.** In-memory ring buffer only; export is the only way out.
- **Capture is unconditional.** Debug mode gates the screen, never the logging.
- **Tests ship with the slice.** Not after.
- **No cloud, no server, no internet.** Household sync is local-network phone-to-phone. No code path may make an outbound internet call.

### 15.1 Dependency allowlist

Everything the app may depend on. Anything not listed requires a spec change first — no freelancing mid-session.

```
Runtime:
  expo-sqlite              database
  expo-notifications       Cooking Mode local notifications ONLY
  expo-keep-awake          Cooking Mode screen
  expo-image-picker        photos & avatar
  expo-image-manipulator   §8 resize/compress pipeline
  expo-file-system         backups, exports, .dishision files
  expo-sharing             share sheet (files, log export)
  expo-camera              QR scanning
  react-native-qrcode-svg  QR generation (+ its react-native-svg peer)
  react-native-tcp-socket  household sync transport
  react-native-safe-area-context  safe-area insets (status bar, notches, gesture/button nav)
  zustand                  log store + UI state
  @expo-google-fonts/fraunces
  @expo-google-fonts/public-sans
  @expo-google-fonts/ibm-plex-mono
  expo-linear-gradient     gradients, photo scrims, hero glow (redesign spec R2–R3)
  expo-haptics             tactile feedback on committing actions (redesign spec R3)
  react-native-gesture-handler  pinch/pan/double-tap in the cook log PhotoViewer (§5.9)
  react-native-reanimated       driving PhotoViewer's zoom/pan transforms off the JS thread (§5.9)
  react-native-worklets         required peer dep of react-native-reanimated 4.x — install directly,
                                 not just transitively, or the app crashes outside Expo Go with a
                                 TurboModule signature-mismatch error (§5.9)

Dev / test:
  vitest, better-sqlite3, jest-expo,
  @testing-library/react-native
```

## 16. Open questions

Deferred, not forgotten:

- **Household size.** The spec assumes 2–4 members. The sync protocol is pairwise, so 6+ members means 5+ syncs to be current. Fan-out or accept it?
- **Public recipe deletion.** If I delete a recipe Tara has cached, her cache drops it on next sync. But if she's already imported it, her copy persists — correct, but worth confirming that's the intent.

**Resolved since v1.1:**

- ~~Recipe photos in the seed~~ → No photos in v1; per-recipe emoji placeholders (§9.1), real photos post-v1 through the §8 pipeline.
- ~~Avatar photos over sync~~ → Emoji-only over sync; photo avatars stay local (§7.4).
- ~~Name~~ → **Dishision stays.** It's cute, and the household's other member gets a vote.

## 17. Changelog

**v1.5**

- **Visual redesign introduced as a companion spec:** `dishision-visual-redesign-spec.md` ("Warm Editorial", R-sections) — the client-approved blend of exploration directions A (Warm & Cozy) + B (Editorial). It supersedes the *visual presentation* of §4.5–4.8 and the *layout* of §5.2–5.10; all behaviour, data, and the token architecture (§4.1–4.4) are unchanged. Pointers added at the top, §4, §4.8, and §5.
- Redesign adds a **centrally-derived visual layer** (elevation/shadows, gradients, hero glow, photo scrim — redesign R2) computed once from the existing tokens — no new per-theme slots, no component-level hex, so the §4.1/§15 architecture is unweakened.
- **Real photos now lead**, with a category-tinted gradient fallback tile replacing the flat emoji tile at card/hero sizes (redesign R4); `photo_uri` already exists (§2.3) so no migration is required.
- **Hard rule added: no horizontal scrolling anywhere** — rows of cards/chips/recommendations wrap (redesign R7).
- Dependency allowlist (§15.1) gains **`expo-linear-gradient`** and **`expo-haptics`** (redesign R8) — the only additions; no animation/blur libraries this phase.
- S17 Polish (§14) is expanded to carry the redesign rollout (redesign R9); it can also run standalone since every screen already exists.

**v1.4**

- **Design system replaced with a multi-theme architecture** (§4.1–4.10). Section renumbered throughout.
- **Seven themes shipped, all fully pinned:** Hearth (new default), Ember, Seaglass, Clay, Risograph, Midnight Kitchen, Dusk — no "Slate & Fig" placeholder, no open TBD slots (§4.3, §4.9)
- Colour tokens formalised as a required contract using the existing `--amber`/`--green`/`--red`/`--surface-warm` names — semantic, not descriptive; every theme fills every slot (§4.2)
- Category colours now defined per-theme, not once globally (§4.4)
- Time-split bar contrast checked explicitly across all seven; Ember flagged as the closest accent/amber pairing, worth an on-device check (§4.7)
- Emoji photo tiles (§4.8, carried over unchanged) confirmed to work across all seven since they depend only on `--surface-warm`
- **Theme picker redesigned as two steps:** a grid to browse, then a full live preview of the actual recipe detail screen in the tapped theme before Apply (§4.10)
- Two structural edge cases documented: Risograph's hard borders, optional per-theme body-face override (§4.3, §4.5)
- Snapshot suite (§11.2) now renders every theme, not two, plus a token-completeness test
- Build slices and sessions updated: S1 builds the provider with Hearth only; S17 lands the remaining six themes plus the two-step picker (§13, §14)
- Constraints (§15) tightened: theming constraint split into three explicit rules

**v1.3**

- "Diary" tab and screen renamed to **Cook log** (§5.1, §5.9, §13, §14) — no schema or behaviour change, naming only

**v1.2**

- Non-goals: notifications reworded — local notifications now permitted inside an active Cooking Mode session only (§1.2, §5.6); no seed photos in v1 (§1.2, §9.1)
- Leftovers modelled: `leftover` table, create on made > eaten, eat/bin actions, editable 3-day expiry, silent expiration; Home strip actions (§2.3, §5.2, §5.7)
- `photo_emoji` on recipe; emoji photo tiles (§4.6); dish-appropriate emoji assigned across the seed (§9.1); travels in the share payload (§7.1)
- `visibility` folded into base DDL; §2.4 is now prose only
- Database conventions: `PRAGMA foreign_keys = ON` everywhere, WAL, `user_version` migrations, test parity (§2.6, §11.1)
- Pack rounding for shopping (§3.5); shopping lines store purchase quantities; shopping list fully editable, regeneration never clobbers edits (§5.8)
- Auto-add shortfalls: settings toggle, on by default, manual add path when off (§5.7, §5.10)
- Cooking session writes are event-driven, never per-tick (§2.3, §5.6)
- Sequential timelines: offsets derived at read time (§5.6)
- Cooking Mode local notifications: scheduling/cancellation rules, permission flow, graceful fallback (§5.6)
- Recommendation engine: primary protein defined (lowest protein tag_id, untagged exempt); duration buckets defined (<20 / 20–40 / >40) (§6.2, §6.4)
- Household average: no-self-rating fallback (§2.5)
- Sharing: QR threshold lowered to 1.2 KB; .dishision format specified (plain JSON, photo as base64) (§7.2)
- Household sync: full transport spec — react-native-tcp-socket, NDJSON, sync_secret auth on every message, last_known_address + Show sync code re-discovery, transactional commit (§2.3, §5.11, §7.5)
- Avatars: emoji-only over sync (§7.4)
- Currency setting: display-only code + symbol, default EUR (§5.10)
- Backup includes leftover and household tables (§10)
- Testing: FK/pragma parity rule, pack rounding, leftover lifecycle, auto-add toggle, notification schedule maths, sync auth + atomicity tests (§11)
- Slices renumbered 0–14; seed data promoted to its own slice; sessions renumbered S0–S17 with seed work split (S2 tooling + first 10, S3 library) and per-session "Read first" spec pointers (§13, §14)
- Model guidance in §14 made version-agnostic (current Sonnet-class / Opus-class)
- Dependency allowlist added (§15.1)
- Open questions: photos, avatars, and name resolved — **the app is called Dishision**

**v1.1**

- Recency filter: 14 days → **5 days, configurable** (§6.2); relaxation ladder now derives from the window (§6.3)
- Added median cost cache with invalidation rules (§6.8)
- Added cost staleness prompt, 90-day threshold, 30-day re-arm (§6.9)
- Added profile table, avatar system, favourites on profile (§5.10)
- Added household: members, pairing, sync, recipe cache, member profiles, removal + tombstones (§5.11, §5.12, §7.4, §7.5)
- Added recipe visibility — private by default (§2.4)
- Added opinion sync: ratings-only, explicit, with orphan handling and staleness labels (§7.6)
- Added testing chapter: Vitest + jest-expo, scope, conventions (§11)
- Added logging chapter: ring buffer, categories, Debug screen, mandatory log points (§12)
- Build slices: added S0 scaffolding, split profile/household/opinion sync/polish (§13, §14)
