# Dishision

**What are we cooking tonight?**

Dishision is a React Native / Expo app that answers one question: *what should we cook?* It is not a recipe manager that happens to make suggestions — it is a decision engine that happens to store recipes. The home screen leads with an answer, not a search bar; cooking produces the data that makes the next recommendation better.

Two people run it on separate phones with independent, private profiles. They can optionally link into a **household** over local WiFi to see each other's public recipes and — only on an explicit opt-in — each other's ratings. There is no cloud, no account, and no server: every sync is a deliberate, phone-to-phone act.

> Full specification: [`docs/design_implementation/dishision-spec.md`](docs/design_implementation/dishision-spec.md). The spec is authoritative; this README is the practical map.

---

## Core principles

- **Recipes are objective, opinions are private.** A recipe is shareable. Ratings, logs, favourites, and plans never leave the device unless you explicitly send them. This split drives the entire schema.
- **The log is the truth.** Cook counts, streaks, ratings, and stats are *derived* from `cook_log` rows, never stored as counters — a stored count drifts from its source. The sole sanctioned stored-state exception is `leftover`.
- **Degrade honestly.** Macros, costs, and pantry state are often partially known. The app shows what it knows and flags what it doesn't ("9 of 11 ingredients"). It never guesses silently.
- **No nagging.** Everything optional, every prompt dismissible.
- **All colour comes from the theme.** No hex literals in components, ever — colour comes from `useTheme()` or it doesn't exist.

---

## Features

| Area | What it does |
| --- | --- |
| **Recommendations** | Scores the library against recency, ratings, cost, and pantry fit; hard filters + a relaxation ladder + a diversity rule. "I'm feeling…" picker with live match counts. |
| **Recipes** | 50+ seeded recipes with emoji tiles, search across name/ingredients/notes, sort, filter, serving scaling, derived macros & cost, manual CRUD, copy-and-tweak. |
| **Cooking Mode** | Full-bleed, wet-hands-friendly. Master clock, drift handling, auto-advance, foreground alerts + local notifications, survives an app kill mid-cook. |
| **Cook log & leftovers** | One row per cook, quick tags, photos (compressed), ingredient substitutions, promote-to-recipe. Leftovers created on cook-complete, eaten/binned/expired. |
| **Planning** | Calendar with independent planned & cooked layers, week view, home plan card. |
| **Shopping & pantry** | List generation with consolidation and pack rounding, fully editable, staples, check-off → pantry, consumption on cook, auto-add shortfalls toggle. |
| **Units** | g / ml / unit base units; tsp/tbsp/cup conversion; density and pack-size maths; unmeasured-ingredient fallback. |
| **Sharing & import** | Per-recipe share via deep link, QR (size-guarded), or `.dishision` file. Import always previews; `share_id`-lineage diff view + manual merge. |
| **Household** | Pairing with a per-pair `sync_secret`, authenticated TCP/NDJSON sync over local WiFi, read-only recipe cache, tombstoned removal. |
| **Opinion sync** | Explicit, one-directional "Send my ratings". Orphan ratings attach automatically on later import. Rating breakdown sheet with household average and honest synced-at dates. |
| **Themes** | 37 themes (light + dark) selectable in Settings, built on a strict semantic token contract. Hearth is the default. |
| **Profile & stats** | Avatar, top-5 favourites, four stat groups, currency (display-only), backup/export, cost-staleness prompt. |
| **Backup** | Versioned JSON export of everything; automatic local backup on app background (last 5 retained). |
| **Debug** | Always-on in-memory ring-buffer logging (2000 entries), category/level filters, export. Gated screen, never gated capture. |

---

## Tech stack

- **Expo SDK 54** / React Native, Android-first (developed on Xiaomi 12 Lite + 13T, both 20:9, edge-to-edge gesture nav).
- **expo-sqlite** with a migration chain keyed on `PRAGMA user_version`; `foreign_keys = ON` and WAL set by the single DB-open helper.
- **zustand** for the log store and transient UI state.
- **react-native-tcp-socket** for household sync (the only networking dependency — no internet code path anywhere).
- Fonts: Fraunces (display), Public Sans (body), IBM Plex Mono (data).
- Tests: **Vitest** (logic + DB integration against real SQLite via better-sqlite3) and **jest-expo** (component snapshots).

The full dependency allowlist lives in spec §15.1 — anything not listed needs a spec change first.

---

## Getting started

```bash
npm install
npm run android      # or: npm start, then choose a target
npm test             # vitest (unit + DB) then jest (snapshots)
npm run test:unit    # logic + DB only (fast, watchable)
npm run test:snapshot
```

On first run the app mints a `person_id`, assigns a random food-emoji avatar, creates the single `profile` row, runs the migration chain, and seeds the recipe/ingredient library (idempotent — re-running changes nothing).

---

## File structure

Tests mirror the source tree under `src/test/` (by explicit project decision, not colocated).

```
App.tsx                     Root: providers (DB, Theme, SafeArea, GestureHandler), first-run bootstrap, seeding
index.ts                    Expo entry point

src/
  db/                       openDatabase + DbClient (the ONLY place connections open), DbContext, migrate
    migrations/             Numbered SQL-in-TS migrations (001_initial … 006_shared_cooks) + index
  theme/                    Theme contract & tokens
    themes.ts               All 37 themes — the per-theme token tables
    ThemeContext.tsx        ThemeProvider + useTheme() (no static colour import anywhere else)
    tokens.ts               Shared, non-themed type/spacing/radius scale
  navigation/               TabShell, tab definitions, UI-chrome store

  screens/                  The five tab screens (containers/routers)
    HomeScreen, RecipesScreen, PlanScreen, CookLogScreen, ProfileScreen

  recipes/                  Recipe read/write path, detail, list items, Cooking Mode UI, forms,
                            RecipeDetailScreen, query/sort/filter engine, meal-type grouping, ingredients admin
  recommend/               Recommendation engine: score, hard filters, diversity, relaxation ladder,
                            daily cache, median-cost cache, "I'm feeling…" picker
  cooking/                 Cook-side logic: session persistence & clock, drift, leftovers, cook log,
                            substitutions, quick tags, pantry consumption, notifications
  plan/                    Planning + shopping + pantry: list generation, pack rounding, calendar,
                            ShoppingListScreen, PantryScreen, mutations
  sharing/                 §7.1–7.3 payload build/parse, deep link / QR / file transport, import preview,
                            diff view, manual merge, base64/photo helpers
  household/               §7.4–7.6 household layer:
                            pairing (syncSecret, PairingScreen), TCP transport (tcpChannel),
                            sync protocol (syncProtocol, syncTypes), recipe cache (syncCache),
                            shared cooks (sharedCooks), opinion sync (opinionSync, RatingBreakdownSheet),
                            member screens, sync-log viewer
  profile/                 Profile, stats, settings, favourites, avatar, cost-staleness/refresh
  settings/                get/set typed settings rows
  backup/                  JSON export + automatic local backup
  photos/                  §8 unconditional resize/compress pipeline
  seed/                    Seed runner + fixture data
    data/recipes.ts        50+ recipe fixtures (mains, air-fryer, desserts)
    data/ingredients.ts    ~150 canonical ingredients with macros + EUR costs
    data/tags.ts           Master tag definitions (protein/diet/meal/style/equipment)
  debug/                   Zustand log store (ring buffer) + Debug screen + JsonViewer
  components/              Cross-screen UI: ConfirmModal, pickers, shared widgets
  lib/                     Pure helpers: scaling, unit conversion, currency, dates, capitalize, categories
  utils/                   Misc utilities
  test/                    Vitest (*.test.ts) + jest-expo snapshots (*.test.tsx), mirroring the tree

docs/design_implementation/
  dishision-spec.md                    Authoritative product/data/behaviour spec
  dishision-visual-redesign-spec.md    "Warm Editorial" visual redesign (S18)
```

### Where to make common changes

- **Add or edit a recipe / ingredient / tag** → `src/seed/data/`. Every `canonicalName` in a recipe must resolve to a `name`/`alias` in `ingredients.ts`; seed tests enforce complete macros, costs, and a mix of active/passive steps.
- **Add a theme** → add a token table in `src/theme/themes.ts`; the theme-matrix snapshot test grows automatically to render it.
- **Change the schema** → add a new numbered migration in `src/db/migrations/` and register it in `index.ts`. Never edit an applied migration; the full DDL is migration 001 and a fresh install runs the same chain as an upgrade.
- **Touch the recommendation logic** → `src/recommend/`.
- **Touch household sync / the wire protocol** → `src/household/syncProtocol.ts` + `syncTypes.ts`; keep opinion sync (`opinionSync.ts`) a separate act from recipe sync.
- **New colour** → never hardcode it; add or reuse a semantic token so all 37 themes stay consistent.

---

## Testing conventions

- Integration tests build a fresh in-memory DB per test by running the **real migration chain** with the same PRAGMAs as the app — schema drift between app and tests is impossible.
- Fixtures come from the real seed data, not hand-rolled doubles. SQLite is never mocked.
- Snapshots render the key screens against **every theme in the roster** — the only thing that catches a stray hardcoded hex, since that bug is invisible until someone switches theme.
- Tests ship with the slice, not after.
