# Dishision

**What are we cooking tonight?**

Dishision is a React Native / Expo app that answers one question: *what should we cook?* Rather than a recipe manager that happens to make suggestions, it is a decision engine that happens to store recipes. The home screen leads with an answer, not a search bar, and every cook feeds the data that improves the next recommendation.

Two people run it on separate phones with independent, private profiles. They can optionally link into a **household** over local WiFi to see each other's public recipes and, only on an explicit opt-in, each other's ratings. Recipes, logs and household sync need no account, cloud or server: every sync is a deliberate phone-to-phone act. The one optional exception is the AI recipe assistant (see [Dishision Bot](#dishision-bot)), which calls the Anthropic API.

> Full specification: [`docs/design_implementation/dishision-spec.md`](docs/design_implementation/dishision-spec.md). The spec is authoritative; this README is the practical map.

---

## How this was built

Dishision is fully vibe coded. I came up with the idea and designed the features and behaviour. The architecture, code, database schema and tests were written by Claude (Claude Code), directed through prompting and iteration. I haven't audited the implementation line by line, so treat this as a personal project that may contain bugs, including in the pairing and sync code, which has not been security reviewed.

Everything below describes what the spec and the generated code are intended to do. It has not been independently verified.

---

## Design principles

- **Recipes are objective, opinions are private.** A recipe is shareable. Ratings, logs, favourites and plans stay on the device unless you explicitly send them. This split drives the schema.
- **The log is the truth.** Cook counts, streaks, ratings and stats are derived from `cook_log` rows, never stored as counters, because a stored count drifts from its source. The one sanctioned stored-state exception is `leftover`.
- **Degrade honestly.** Macros, costs and pantry state are often partially known. The app shows what it knows and flags what it doesn't ("9 of 11 ingredients") instead of guessing silently.
- **No nagging.** Everything is optional and every prompt is dismissible.
- **All colour comes from the theme.** No hex literals in components; colour comes from `useTheme()`.

---

## Features

| Area | What it does |
| --- | --- |
| **Recommendations** | Scores the library on recency, ratings, cost and pantry fit, with hard filters, a relaxation ladder and a diversity rule. An "I'm feeling…" picker shows live match counts. |
| **Recipes** | 50+ seeded recipes with emoji tiles; search across name, ingredients and notes; sort and filter; serving scaling; derived macros and cost; manual CRUD; copy-and-tweak. |
| **Cooking Mode** | Full-bleed and wet-hands-friendly, with a master clock, drift handling, auto-advance, foreground alerts and local notifications. Designed to survive an app kill mid-cook. |
| **Cook log & leftovers** | One row per cook, quick tags, compressed photos, ingredient substitutions, promote-to-recipe. Leftovers are created on cook-complete and can be eaten, binned or expired. |
| **Planning** | Calendar with independent planned and cooked layers, week view, home plan card. |
| **Shopping & pantry** | List generation with consolidation and pack rounding, fully editable lists, staples, check-off into the pantry, consumption on cook, optional auto-add of shortfalls. |
| **Units** | g / ml / unit base units; tsp/tbsp/cup conversion; density and pack-size maths; fallback for unmeasured ingredients. |
| **Sharing & import** | Per-recipe share via deep link, QR (size-guarded) or `.dishision` file. Imports always preview first, with a `share_id`-lineage diff view and manual merge. |
| **Household** | Pairing with a per-pair `sync_secret`, TCP/NDJSON sync over local WiFi, read-only recipe cache, tombstoned removal. |
| **Opinion sync** | Explicit, one-directional "Send my ratings". Orphan ratings attach automatically on a later import. A rating breakdown sheet shows the household average and synced-at dates. |
| **Dishision Bot** | Optional chat-based recipe creation and refinement using the Anthropic API. See below. |
| **Themes** | 37 light and dark themes selectable in Settings, built on a strict semantic token contract. Hearth is the default. |
| **Profile & stats** | Avatar, top-5 favourites, four stat groups, display-only currency, backup/export, cost-staleness prompt. |
| **Backup** | Versioned JSON export of everything, plus an automatic local backup when the app backgrounds (last 5 kept). |
| **Debug** | Always-on in-memory ring-buffer logging (2000 entries) with category/level filters and export. The screen is gated; capture never is. |

### Dishision Bot

The Bot lets you create and refine recipes by chatting, or by pasting a link to extract one. It is the only feature that makes internet requests: it calls the Anthropic API directly from the app and can fetch pages for link extraction. Chats, usage and the API key are stored locally on the device. The key is only sent to Anthropic as part of the app's own API requests. Household sync never touches the internet.

---

## Tech stack

- **Expo SDK 54 / React Native**, Android-first. Target devices are the Xiaomi 12 Lite and 13T (20:9, edge-to-edge gesture navigation).
- **expo-sqlite** with a migration chain keyed on `PRAGMA user_version`. `foreign_keys = ON` and WAL are set by the single DB-open helper.
- **zustand** for the log store and transient UI state.
- **react-native-tcp-socket** for household sync, which is local-network only.
- **Anthropic API** (via `fetch`) for the optional Bot.
- **Fonts:** Fraunces (display), Public Sans (body), IBM Plex Mono (data).
- **Tests:** Vitest (logic and DB integration against real SQLite via better-sqlite3) and jest-expo (component snapshots).

The full dependency allowlist is in spec §15.1; anything not listed needs a spec change first.

---

## Getting started

```bash
npm install
npm run android      # or: npm start, then choose a target
npm test             # vitest (unit + DB), then jest (snapshots)
npm run test:unit    # logic + DB only (fast, watchable)
npm run test:snapshot
```

On first run the app creates a `person_id`, assigns a random food-emoji avatar, creates the single `profile` row, runs the migration chain and seeds the recipe and ingredient library. Seeding is idempotent, so re-running it changes nothing.

---

## Project structure

```
App.tsx          Root: providers (DB, Theme, SafeArea, GestureHandler), first-run bootstrap, seeding
index.ts         Expo entry point

src/
  db/            openDatabase + DbClient (the only place connections open), DbContext, migrate
    migrations/  Numbered SQL-in-TS migrations (001_initial … 006_shared_cooks) + index
  theme/         Theme contract and tokens
    themes.ts    All 37 themes (per-theme token tables)
    ThemeContext.tsx   ThemeProvider + useTheme()
    tokens.ts    Shared, non-themed type/spacing/radius scale
  navigation/    TabShell, tab definitions, UI-chrome store
  screens/       The five tab screens: Home, Recipes, Plan, CookLog, Profile
  recipes/       Recipe read/write path, detail, list items, Cooking Mode UI, forms,
                 query/sort/filter engine, meal-type grouping, ingredients admin
  bot/           Dishision Bot: Anthropic client (propose_recipe tool), system prompt,
                 proposed-recipe mapping and ingredient resolution, chat/usage repos,
                 context pruning, link fetch/extract, refine diff, secure API key store,
                 and the Chat / Review / Diff / History / Settings screens
  recommend/     Scoring, hard filters, diversity, relaxation ladder, daily and median-cost
                 caches, "I'm feeling…" picker
  cooking/       Session persistence and clock, drift, leftovers, cook log, substitutions,
                 quick tags, pantry consumption, notifications
  plan/          Planning, shopping and pantry: list generation, pack rounding, calendar
  sharing/       Payload build/parse, deep link / QR / file transport, import preview,
                 diff view, manual merge
  household/     Pairing, TCP transport, sync protocol, recipe cache, shared cooks,
                 opinion sync, member screens, sync-log viewer
  profile/       Profile, stats, settings, favourites, avatar, cost-staleness/refresh
  settings/      Typed settings rows
  backup/        JSON export and automatic local backup
  photos/        Resize/compress pipeline
  seed/          Seed runner and fixture data (recipes, ingredients, tags)
  debug/         Log store (ring buffer), Debug screen, JsonViewer
  components/    Cross-screen UI (ConfirmModal, pickers, shared widgets)
  lib/           Pure helpers: scaling, unit conversion, currency, dates, categories
  utils/         Misc utilities
  test/          Vitest (*.test.ts) and jest-expo snapshots (*.test.tsx), mirroring src/

docs/design_implementation/
  dishision-spec.md                      Authoritative product, data and behaviour spec
  dishision-visual-redesign-spec.md      "Warm Editorial" visual redesign
  dishision-ai-recipe-creation-spec.md   Dishision Bot: recipe creation and refinement
```

### Common changes

- **Add or edit a recipe, ingredient or tag:** `src/seed/data/`. Every `canonicalName` in a recipe must resolve to a name or alias in `ingredients.ts`; seed tests check for complete macros, costs and a mix of active and passive steps.
- **Add a theme:** add a token table in `src/theme/themes.ts`. The theme-matrix snapshot test picks it up automatically.
- **Change the schema:** add a new numbered migration in `src/db/migrations/` and register it in `index.ts`. Never edit an applied migration.
- **Change recommendation logic:** `src/recommend/`.
- **Change household sync or the wire protocol:** `src/household/syncProtocol.ts` and `syncTypes.ts`. Keep opinion sync (`opinionSync.ts`) a separate act from recipe sync.
- **Add a colour:** never hardcode it. Add or reuse a semantic token so all 37 themes stay consistent.

---

## Testing

The tests were also written by Claude and follow these conventions:

- Integration tests build a fresh in-memory database per test by running the real migration chain with the same PRAGMAs as the app, so tests and app share one schema.
- Fixtures come from the real seed data rather than hand-rolled doubles, and SQLite is never mocked.
- Snapshots render the key screens against every theme, which catches stray hardcoded colours that only show up when the theme changes.
- Tests ship with each slice of work, not after.
