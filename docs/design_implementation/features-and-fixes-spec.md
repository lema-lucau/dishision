# Dishision — Features & Fixes Spec (handoff to implementing agent)

> **Status:** ready to implement. Authored 2026‑08‑10 on branch `features-n-fixes`.
> **How to use this doc:** each item is self‑contained with the exact files, current behaviour, the required change, and the product decisions already made with the user. Implement in any order; items are grouped by area. Follow `AGENTS.md` — read the versioned Expo 54 docs (https://docs.expo.dev/versions/v54.0.0/) before touching native/config surfaces.

## Ground rules (apply to every item)
- **Theming:** never import colours statically. Read colour via `useTheme()` and build styles with `makeStyles(theme)` (see any screen). New colours must come from the theme.
- **Safe area:** use `react-native-safe-area-context` (`useSafeAreaInsets`) anywhere near a screen edge. See `[[preppie_safe_area]]` convention.
- **Keyboard avoidance:** use the standard `KeyboardAvoidingView` with `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}`, matching the existing pattern in `BotChatView.tsx`/`PantryScreen.tsx`. Do **not** build a custom hook (a previous attempt failed and was removed).
- **Tests:** unit logic is Vitest (`src/test/**`, mirrors source — see `[[preppie_test_layout]]`); snapshots are jest‑expo. Add/adjust tests for any pure logic you add (formatters, planners, version diffing, sync triggers).
- **Target devices:** Xiaomi 12 Lite + 13T, both 20:9. Design/verify against tall narrow screens.

## Decisions already made (with the user)
| Area | Decision |
|---|---|
| Auto light/dark | User picks an explicit **Day theme** and **Night theme**; switch times editable, default **08:00** (day) / **18:00** (night). |
| Staples | **Merge into Pantry** — drop the separate Staples tab; show staples inline with a badge + a "Staples only" filter; keep par‑level / running‑low logic. |
| Currency | Shortlist of **up to 5**, one active. A **"Manage currencies"** flow lets the user swap a slot for a preloaded currency or add a brand‑new one (name + symbol). Preloaded default 5: EUR, AUD, USD, GBP, NZD. No conversion — symbol only. |
| Household sync | **Foreground + change triggers**: a listener stays up whenever the app is foregrounded; auto mutual sync fires on app‑foreground and after a debounced local change. Keep manual "Sync now". |
| Bot recipe versions | **Persisted** version history with per‑version change summaries and **restore**; continuing from a restored version appends a new version (linear). |
| Theme‑creator bot | **Generate & adjust the palette** — a new bot surface with a propose‑theme tool that fills the creator's colour fields; review before applying. Gated by the same per‑surface disable setting. |
| Phone back button | **Android‑standard**: close modal → unwind sub‑screens → non‑Home tab returns to Home → Home root double‑press/confirm to exit. |
| Cooking auto‑advance | **On by default**; a setting switches to confirm‑before‑advance. |

---

# A. Theming

## A1. Time‑based automatic light/dark switch
**Files:** `src/theme/ThemeContext.tsx`, `src/theme/ThemePickerScreen.tsx` (library hub — see `[[theme-system]]`), `src/settings/{getSetting,setSetting}.ts`.

**Current:** `ThemeProvider` persists a single `theme` id (`THEME_SETTING_KEY`) and applies it. Themes carry a `mode` field (`light`/`dark`) but nothing schedules a switch.

**Required:**
1. New settings keys:
   - `auto_theme_enabled` (`'0'`/`'1'`, default `'0'`).
   - `theme_day_id` (defaults to current theme / Hearth default).
   - `theme_night_id` (defaults to a dark theme; if none chosen, feature is inert until set).
   - `theme_day_time` (default `'08:00'`), `theme_night_time` (default `'18:00'`). Store as `HH:MM` 24h strings.
2. Add a pure helper (Vitest‑tested) e.g. `src/theme/autoThemeSchedule.ts`:
   - `themeIdForTime(now: Date, dayTime: string, nightTime: string, dayId: string, nightId: string): string` — night applies from `nightTime` up to `dayTime` (handles the wrap across midnight).
   - `nextBoundaryMs(now, dayTime, nightTime): number` — ms until the next switch, for scheduling a timer.
3. In `ThemeProvider`, when `auto_theme_enabled`:
   - On mount, on `AppState` change to `'active'`, and via a `setTimeout` armed to `nextBoundaryMs` (re‑armed each fire), compute the target id and call `setTheme(target)` if different.
   - Manual theme changes remain allowed; the next boundary re‑applies the scheduled theme. (Don't fight the user mid‑session beyond the scheduled flip.)
4. UI: add an **"Auto day/night"** section to `ThemePickerScreen` (the library hub) — a master toggle, a Day‑theme picker, a Night‑theme picker (both choose from built‑in + custom themes), and two time fields (use `DatePickerModal`/a simple time entry; times editable). Mirror the toggle in the appearance area of `SettingsScreen` if that's where users expect it, but the pickers live in the theme hub.

**Notes:** keep the switch instant (no animation), consistent with the existing optimistic `setTheme`. Don't switch while `overrideTheme`/`overrideThemeId` previews are active.

---

# B. Dishision Bot / Chat

## B1. Long‑press a chat bubble to copy it
**Files:** `src/bot/BotChatView.tsx` (primary); optionally `src/bot/CookingQuickAskSheet.tsx` for the mid‑cook transcript.
**Dependency:** add `expo-clipboard` (`npx expo install expo-clipboard`) — not currently installed.

**Required:** wrap each message bubble (the `props.messages.map(...)` `View` at `BotChatView.tsx:179`) so a long‑press copies `m.content` via `Clipboard.setStringAsync`, fires a light `expo-haptics` tick, and shows a brief confirmation (existing `useConfirmModal` `notice`, or a small toast). Works for **both** user and bot bubbles. Reuse the same behaviour in the quick‑ask sheet if trivial.

## B2. Persisted recipe version history + restore
**Files:** `src/bot/BotChatScreen.tsx`, `src/bot/chatRepo.ts`, `src/bot/botRecipeDiff.ts`, `src/bot/BotReviewScreen.tsx`, `src/bot/BotDiffReview.tsx`, new migration under `src/db/migrations/`.

**Current:** one mutable `workingDraft`. Each refine produces a diff (`buildBotDiff(base, next)`); on **Apply selected**, `applyBotDiff` merges accepted changes and overwrites `workingDraft` + the chat draft (`updateDraft`). No history is kept — the previous state is gone. The bot's prose already narrates changes, but there's no persistent, browsable record and no way back.

**Required:**
1. **Schema:** new table (migration) `bot_recipe_version`:
   - `id` (pk), `chat_id` (FK `bot_chat`), `version_index` (int, 0‑based, monotonic per chat), `draft_json` (the `proposed` draft, same shape stored in `bot_chat.draft`), `change_summary_json` (serialized list of the accepted `BotDiffChange`s that produced this version; empty/`null` for the initial version), `label` (nullable — e.g. "Initial recipe", or derived), `created_at`.
2. **Write a version** whenever the working draft advances:
   - The first time a chat gains a candidate recipe (initial proposal) → version 0, summary = null ("Initial recipe").
   - On `applyDiff` (accepted set applied) → new version with `change_summary_json` = the accepted `BotDiffChange`s (so the summary reflects what the user actually kept, not everything proposed).
   - Continuing from a restored version **appends** a new version (linear history; do not truncate/branch).
3. **Restore:** a **Versions** entry point (e.g. a "Versions (n)" link in `BotReviewScreen`'s chrome and/or the chat header). Opens a list, newest first, each row showing `version_index`, `created_at`, and a readable change summary (reuse `BotDiffReview`'s `changeVerb` + old/new text grammar). Tapping a version shows its full change detail; a **Restore this version** action sets `workingDraft` (and `bot_chat.draft` via `updateDraft`) to that version's `draft_json`, then appends it as a new head version. Subsequent refines diff against the restored draft.
4. Keep everything working when the chat is unpersisted until first content (`ensurePersisted` in `BotChatScreen.tsx`) — only write versions after the chat row exists (versions FK to `bot_chat`).

**Tests (Vitest):** version‑index monotonicity; summary captures only accepted changes; restore→refine appends linearly.

## B3. Acknowledge refinements ("here's the *updated* recipe")
**Files:** `src/bot/sharedPrompt.ts`, `src/bot/systemPrompt.ts`, `src/bot/proposeRecipeTool.ts` (whichever carries the assistant‑message guidance).

**Current:** the bot says "here's the new recipe" on every turn, including refinements, which reads wrong when the user asked for a tweak.

**Required:** update the instructions so the assistant differentiates:
- **First proposal / fresh creation:** "Here's the recipe…".
- **Refinement of an existing candidate:** briefly **acknowledge the user's specific request**, then "Here's the updated recipe…" (e.g. "Made it spicier and dropped the servings to two — here's the updated recipe."). The system already knows whether a working draft existed before the turn (`workingDraftRef` / `fromReview`), so the prompt can instruct: if a current recipe already exists, treat this as an update and phrase accordingly.

## B4. Add Dishision Bot to the theme creator (generate/adjust palette)
**Files:** `src/bot/botSession.ts` (add `'theme_creator'` to `BotSurface`), `src/bot/botSurfaceSettings.ts` (`BOT_SURFACES`, labels, hints, `TOGGLE_KEYS`), new `src/bot/proposeThemeTool.ts`, `src/theme/ThemeCreatorScreen.tsx`, and `BotSettingsScreen.tsx` (auto‑picks up the new surface since it iterates `BOT_SURFACES`).

**Required:**
1. New surface `theme_creator` wired through the shared session layer (`runSurfaceTurn`) exactly like recipe/meal‑plan surfaces. Default ON; when off, hide the entry point (mirrors `getSurfaceEnabled` behaviour).
2. `propose_theme` tool (schema like `PROPOSE_MEAL_PLAN_TOOL`/`proposeRecipeTool`) returning the full colour set the creator needs — i.e. the **seed** colours and any **overrides** the creator edits (see `ThemeCreatorScreen` `setSeed`/`setOverrides` and `buildCustomTheme`/`customTheme.ts` for the exact fields) plus a suggested `name`. From a prompt like "cozy autumn evening", the bot fills those fields.
3. Entry point in `ThemeCreatorScreen`: a bot affordance (button/sheet) gated by `getSurfaceEnabled(db,'theme_creator')`. On a proposal, apply the returned colours into `seed`/`overrides` and `name`, then let the user tweak and Preview/Save as normal — **review before applying** (don't auto‑save).
4. Add the surface to `SURFACE_TOGGLE_LABELS`/`SURFACE_TOGGLE_HINTS` so it appears in Settings → Dishision Bot automatically.

## B5. Chat screen spacing + delete voice input
**Files:** `src/bot/BotChatView.tsx`; delete `src/bot/useVoiceInput.ts` (only consumer is `BotChatView` — verify with a grep before deleting).

**Required:**
1. **More space above the pills:** increase the gap between the header and the `pillRow` (add top padding to `pillRow`, or bottom padding to `header`).
2. **Less space beneath the input:** the `inputArea` uses `paddingBottom: insets.bottom || theme.spacing.sm`. Halve the current effective bottom space (e.g. `Math.max(insets.bottom / 2, theme.spacing.xs)` or reduce the `paddingTop`/`gap`). Keep it clear of the gesture bar but tighter.
3. **Delete voice input entirely:** remove the mic button, `voice`/`useVoiceInput` usage, `voiceError` UI, and the `useVoiceInput.ts` file. The transcript‑into‑input behaviour goes away.

---

# C. Pantry & Staples
**File:** `src/plan/PantryScreen.tsx` (+ `pantryMutations.ts`, `staples.ts`). Match the shopping list's edit pattern in `src/plan/ShoppingListScreen.tsx` / `DraggableShoppingSection.tsx`.

## C1. Merge Staples into Pantry (remove the separate tab)
**Current:** a `Section` segmented control toggles `'pantry'`/`'staples'`; staples are just pantry items with `isStaple` (rows already show a "Staple" pill). Par‑level / running‑low logic lives on the staples rows.

**Required:** remove the segmented Pantry/Staples switch. Show **one pantry list** with:
- A **"Staples only"** filter chip (plus "All").
- The existing **Staple** badge inline on staple rows.
- Keep par‑level + running‑low editing accessible for staple items (inline, e.g. an expandable control on staple rows, preserving `setStapleParLevel`/`setStapleRunningLow` and the "excluded from shopping list unless low" behaviour). Keep the help text explaining running‑low, shown when the Staples filter is active.
- Keep bulk "Mark as staple" / "Un‑mark as staple" in the selection bar, now acting on the unified list.

## C2. Clear‑pantry button
**Required:** a **Clear pantry** action (in a header/tools area) that, after a destructive confirm (`useConfirmModal`), removes **all** pantry items (`removePantryItems` over all ids, or a new `clearPantry` mutation). Scope = pantry items; be explicit in the confirm about whether staples are included (recommend: clears everything in the pantry, including staple stock, matching "delete all the items in the pantry" — state it in the confirm copy).

## C3. Explicit edit/delete mode (not constantly editable)
**Current:** qty inputs and par‑level inputs are always editable inline; "Select" mode only toggles bulk‑delete checkboxes.
**Required:** make rows **read‑only by default** and add an **Edit** toggle (mirroring the shopping list). In edit mode, quantity/unit/par‑level become editable and a per‑row delete is available; outside edit mode the list is display‑only. Fold this together with the existing Select/bulk mechanism so there's one coherent "editing" state rather than two overlapping ones.

## C4. Page‑size selector 10 / 20 / 30 / 50 (default 20)
**Current:** `const PAGE_SIZE = 15;` fixed, with prev/next pagination.
**Required:** replace the constant with state (default **20**) and a small selector (segmented/pills: 10/20/30/50). Recompute pages on change; reset to page 1. Persist the choice in settings if easy (nice‑to‑have).

## C5. Add‑ingredient search: scrollable, bounded, with result count
**Current:** the add‑search suggestions (`addSuggestions` from `searchCanonicalIngredients`) render as a plain `View` (`styles.suggestions`, `maxHeight: 160`) that maps rows — with many results it overflows/clips and can cover the screen.
**Required:** render suggestions inside a **bounded, nested `ScrollView`** (fixed `maxHeight`, `keyboardShouldPersistTaps="handled"`, `nestedScrollEnabled`) and show a **"N results"** header. Same treatment for the list search: show a **result count** for the filtered pantry/staples list. Ensure it never escapes its container regardless of result count.

## C6. Keyboard avoidance while editing pantry/staple rows
**Current:** the list is already wrapped in `KeyboardAvoidingView`, but editing a qty/par input low on the screen can still be covered.
**Required:** verify the qty and par‑level inputs stay visible when the keyboard opens (the inputs are deep in the scroll list). Ensure the `KeyboardAvoidingView` wraps the scroll correctly and the focused row scrolls into view. Test on device with a long list.

---

# D. Cooking Mode
**File:** `src/recipes/CookingModeScreen.tsx`, `src/cooking/lanes.ts`, `src/cooking/session.ts`, `src/lib/formatDuration.ts`.

## D1. Fix auto‑advance (steps not advancing within lanes) + make it configurable
**Current:** the auto‑advance effect (`CookingModeScreen.tsx:260‑269`) walks the **merged** `timelineSteps` and advances `session.currentStepId` when `elapsedSeconds >= effectiveStartOffset(next)`. Reported bug: it spins up new lanes but doesn't reliably advance steps *within* a lane, so it "tweaks out" and can obscure the current step.

**Required:**
1. **Fix the advance logic** so steps advance automatically and reliably:
   - Investigate why intra‑lane steps stall. Likely causes to check: the effect's dependency array omits `stepRuntime`/`timelineSteps`/`stepTimings`; `effectiveStartOffset` for steps with no scheduled offset / null duration may resolve in a way that never crosses `elapsedSeconds`; and advancing on the merged timeline can jump lanes rather than progressing the visible lane's live step. Ensure a running step whose duration has elapsed advances to the next step **in the same lane** without user input.
   - Keep manual peek (`←`) and manual advance (`→` past live) intact — auto‑advance must never fight a backward peek (existing invariant).
2. **New setting** `cook_auto_advance` (default **ON**). When ON: advance automatically, no prompt (current intended behaviour). When OFF: when a step becomes due, **don't auto‑advance** — surface a "ready for the next step?" confirmation (reuse the takeover/`ConfirmModal` pattern) and, if the user doesn't confirm, hold on the current step until they advance manually, then continue as normal. Expose the toggle in Settings alongside the other alert settings (`alert_vibrate`, `alert_takeover`).

**Tests (Vitest):** extend `src/test/cooking/*` — a lane with sequential timed steps auto‑advances through all of them from the master clock; with the setting off, it stops at a due step until advanced.

## D2. Lane layout: max 3 per row, overflow scrolls, show the 3 most relevant
**Current:** `laneTabs` uses `flexWrap: 'wrap'` with `flexGrow` tabs (`CookingModeScreen.tsx:808`), so with >3 lanes the tabs wrap into multiple rows, grow vertically, and push down / cover the current step and the "Step X of Y" text.

**Required:**
- Cap the lane strip to **3 lanes per row**; overflow wraps to additional rows **inside a bounded, horizontally‑or‑vertically scrollable container** (fixed height for ~one row) so it never eats the step area.
- Show the **3 most relevant lanes** for the current moment by default (relevance ordering already exists — `laneNeedingAttention`/`resolveVisibleLane` in `lanes.ts`; reuse it to pick which 3 to show: the visible/pinned lane + the next lanes needing attention). The user can scroll to reach previous/next lanes.
- **Consistent tab sizing** regardless of count (fixed width/height per tab; don't let `flexGrow` distort them).
- Guarantee the current step and the "Step X of Y" counter remain visible with any lane count.

**Add** a pure helper in `lanes.ts` (Vitest‑tested), e.g. `visibleLaneWindow(statuses, visibleKey, count=3): LaneStatus[]`, returning the 3 lanes to display.

## D3. Show seconds in step durations (recipe detail + cooking mode)
**Current:** `formatDuration` (`src/lib/formatDuration.ts`) rounds to whole minutes, so a 30‑second step reads "0 mins" / "1 min" — you can't tell when it ends.
**Required:** add a seconds‑aware formatter (e.g. `formatDurationPrecise(seconds)`): `< 60s` → `"30 sec"`; whole minutes → existing minute/hour formatting; minutes **with** a seconds remainder → `"1 min 30 sec"` (and `"1h 5m 30s"` style for hour+). Use it wherever a **step** duration is shown that can carry sub‑minute values — recipe detail step rows and the Cooking Mode step timer (`stepTimer`, and the live "remaining" display). Keep the running master clock as `formatClock` (already MM:SS). Don't change the coarse recipe total/time‑bar formatting unless it currently misleads.
**Tests:** cover `<60s`, exact minutes, minutes+seconds, hour+minutes+seconds.

---

# E. Household sync — make it seamless (auto) while keeping manual
**Files:** `src/household/tcpChannel.ts`, `src/household/syncProtocol.ts`, `src/household/pairingProtocol.ts`, `src/household/localAddress.ts`, `src/household/address.ts`, `src/household/householdMutations.ts`, `src/household/HouseholdScreen.tsx`, app root (`index.ts`/`App`), plus a new small auto‑sync coordinator + settings.

**Current architecture (important):**
- Transport is `react-native-tcp-socket` with NDJSON framing (`tcpChannel.ts`). `startListener(port, onConnection)` opens a TCP server; **today the listener is only up while the pairing/household screen is mounted** (ephemeral port, screen‑scoped lifecycle).
- A sync is **manual, foregrounded, one‑directional pull**: the initiator (`runInitiatorSync`) connects to a peer's `host:port`, pulls their public recipes into `household_recipe_cache`, pushes queued shared cooks, and commits atomically. Ratings are a **separate** connection (`runRatingsInitiator`/`Responder`). `handleIncomingConnection` dispatches inbound pair/sync/ratings.
- Peer address comes from pairing (QR embeds the LAN IP via `getLocalAddress`, stored on the member row). **IPs drift on DHCP**, so a stored address goes stale — this is the main robustness risk for "just works over WiFi".

**Required — implement the "foreground + change triggers" model:**

1. **Always‑on foreground responder.** Start a listener on a **fixed, well‑known port** (a new constant, not the ephemeral pairing port) whenever the app is foregrounded; close it on background. Route connections through the existing `handleIncomingConnection` (pass `activePairingSession = null` for non‑pairing traffic; pairing keeps its own screen‑scoped session as today). Put this in an app‑root effect so it's not tied to the household screen.

2. **Address freshness / discovery (the crux).** Stale IPs must self‑heal or auto‑sync silently fails. Choose one, in order of preference:
   - **(Recommended) Lightweight LAN discovery:** add UDP broadcast (e.g. `react-native-udp`) — on foreground, broadcast `{personId, ip, port}` on a fixed UDP port and listen for peers' broadcasts; when a known member's IP is heard, update `household_member.address`. Then TCP‑connect for the real sync. This makes it "just work" when both are on the same WiFi.
   - **(Minimum) Re‑exchange address each sync:** during the existing handshake, include each side's current IP and `updateMemberProfile`‑style persist it; on auto‑sync, try the last‑known address and skip silently on failure. Less seamless (first sync after an IP change still misses) but no new dependency.
   - Flag this choice to the user if you add a native dependency.

3. **Auto‑sync triggers** (new coordinator, e.g. `src/household/autoSync.ts`, zustand‑style like `uiChromeStore`):
   - **On app foreground** (`AppState` → `active`): run a mutual sync cycle against every non‑removed household member.
   - **After a relevant local change, debounced (~a few seconds):** cook logged, recipe visibility → public/private, rating changed, shared‑cook queued. Fire a "dirty" signal these call sites emit; the coordinator debounces and runs a sync cycle. (Add the emit calls at the mutation sites: cook‑complete save, recipe visibility toggle, rating write, shared‑cook enqueue.)
   - Guard against overlap (an in‑flight flag) and **fail silently** when a peer is offline (log at `warn`, no user‑facing error).

4. **Mutual sync cycle.** For each member: run `runInitiatorSync` (pull their recipes + push our shared cooks) and `runRatingsInitiator` (push our ratings). The peer's responder handles our inbound automatically; the peer's own foreground/change triggers cover the reverse direction. Reuse the existing atomic/transactional protocol unchanged — auto‑sync is just an automated caller of the same functions with a fresh channel.

5. **Settings + manual.** Add `auto_sync_enabled` (default **ON**). Keep the manual **"Sync now"** in `HouseholdScreen` exactly as is. Keep the sync‑log viewer; auto‑syncs should write the same `sync_event`/`sync_item` records so the log reflects them (consider tagging them as automatic vs manual for clarity).

6. **Audit findings to verify while here** (user asked "is anything missing, will it stay in sync through cooks?"):
   - Shared "cooked‑with" cooks currently only flow **on the initiator's push** — confirm both members end up with the cook + leftovers reflected after a mutual cycle (see `sharedCooks.ts`, `[[household-shared-cooks]]`).
   - Ratings sync is a separate connection — ensure the auto cycle includes it so opinions stay current (`[[opinion-sync]]`).
   - Leftovers created from a shared cook: verify both apps show them after sync (leftovers derive from cook logs — confirm the applied shared cook produces the same leftover state on the receiving side).

**Tests:** the protocol is already tested against an in‑memory fake channel (native transport can't run under Vitest). Add pure tests for the debounce/coordinator logic and the address‑update rule; keep transport untested per the existing boundary pattern.

---

# F. Navigation — phone back button
**Files:** new `src/navigation/backStore.ts` (zustand, like `uiChromeStore.ts`), app root, and every screen/modal that owns "back" state (`TabShell.tsx`, `RecipesScreen.tsx`, `BotChatScreen.tsx`, `CookingModeScreen.tsx`, household screens, sheets/modals).

**Current:** navigation is **custom and state‑based** — `TabShell` holds `activeTab` + booleans for household/theme/debug; screens like `RecipesScreen`/`BotChatScreen` hold their own `phase` state. **There is no `BackHandler` anywhere**, so Android's hardware back closes the whole app.

**Required (Android‑standard behaviour):** implement a lightweight **back‑intent registry** rather than adopting React Navigation:
1. `backStore`: a LIFO stack of handlers. `registerBackHandler(fn: () => boolean): unregister`. A handler returns `true` if it consumed the press.
2. A single `BackHandler.addEventListener('hardwareBackPress', …)` at the app root pops/calls the top handler; if it returns `true`, stop. If the stack is empty:
   - If a modal/sheet is open → close it (modals register their own handler on mount, so this is usually handled by the stack).
   - Else if not on the Home tab → switch to Home tab.
   - Else (Home root) → **double‑press within ~2s to exit** (or a confirm), otherwise show a "press back again to exit" toast and consume the first press.
3. Register handlers (each returns true when it has something to close), roughly in this order of specificity: open sheets/modals (confirm modals, unit pickers, step list, quick‑ask, eat sheet, etc.) → full‑screen sub‑flows (Cooking Mode, Bot chat/review/diff/history/settings, Household + its sub‑screens, Theme picker/creator, Debug, sharing import/merge) → tab‑level (non‑Home → Home) → app‑exit guard.
4. Prefer registering at the component that renders each dismissible layer (on mount/unmount) so the stack mirrors what's visually on top. Use `useEffect` cleanup to unregister.

This is the most cross‑cutting item — do it as its own pass and verify each screen's back press matches its in‑app back button.

---

# G. Settings — currency
**Files:** `src/lib/currency.ts`, `src/settings/{getSetting,setSetting}.ts`, `src/profile/SettingsScreen.tsx`, plus everywhere `currency_symbol` is read (grep: `RecipesScreen`, `HomeScreen`, `StatsScreen`, `RecipeDetailScreen`, `IngredientPriceSheet`, `IngredientsScreen`, `CostRefreshScreen`, `FeelingPickerSheet`, household screens, etc.).

**Current:** a single `currency_symbol` setting; `formatCurrency(value, symbol)` just prepends the symbol. The existing "custom currency" input **doesn't work**. No conversion anywhere — it's purely which symbol displays.

**Required (decided model):**
1. Replace the broken custom‑currency input with a **"Manage currencies"** flow (modal).
2. Data: store a **shortlist of up to 5** currencies, each `{ name, symbol }`, plus which one is **active**. Preload the default 5: **EUR (€), AUD (A$), USD ($), GBP (£), NZD (NZ$)**. Persist in settings (e.g. `currency_shortlist` JSON + `currency_active` index/symbol; keep `currency_symbol` in sync so existing readers keep working — the active symbol writes through to `currency_symbol`).
3. **Manage currencies modal:** shows the ≤5 slots; for each slot the user can **swap** it for a different **preloaded** currency (offer a picker of common currencies) or **add a brand‑new** one via a small form (name + symbol) when it isn't in the preloaded list. Tapping a shortlist entry sets it **active**.
4. No conversion. Changing the active currency only changes the displayed symbol app‑wide.
**Tests:** extend `src/test/lib/currency.test.ts` and `src/test/settings/*` for shortlist parsing / active‑symbol write‑through.

---

# H. UI polish

## H1. Leftovers "Bin" button colour (Home)
**File:** `src/screens/HomeScreen.tsx:307‑314`.
**Current:** the **Bin** `PillButton` uses `variant="ghost" destructive` — transparent, so it blends into the leftovers `Card`. **Eat** uses `variant="soft"`.
**Required:** give Bin a **distinct filled/tinted** look (e.g. a filled destructive variant — `redTint` background with `red` text) so it's clearly a button and visually separate from both the card and the Eat button. If `PillButton` lacks a suitable filled‑destructive variant, add one.

## H2. Theme editor "Save" button (preview footer)
**File:** `src/theme/ThemeCreatorScreen.tsx:110‑117` (`footerGhost`/`footerGhostText`).
**Current:** the preview footer **Save** is a ghost button — white with a weak border — next to the filled **Save & apply**.
**Required:** **fill** the Save button with a distinct colour and make its **text white** (still visually secondary to "Save & apply" but clearly a solid button, not an outline). Update the `footerGhost`/`footerGhostText` styles accordingly.

## H3. Review‑changes screen (bot diff): count + full‑width buttons + filled Discard
**File:** `src/bot/BotDiffReview.tsx`.
**Current:** subtitle shows total change count; footer has `Discard` (`variant="ghost"`) + `Apply selected` (`flex:1`), so Discard is small and outline‑only.
**Required:**
1. Show **"X of Y changes accepted"** live (derive from `accepted.size` / `changes.length`) — e.g. update the subtitle or add a line near the Accept‑all row that updates as the user toggles.
2. Make the footer buttons **each take half the row** (both `flex:1`, equal width, full width together).
3. **Fill the Discard button** with a colour (destructive) and make its **text white** (not ghost/outline).

---

# I. Cook logs — mid‑cook notes go to the Notes field
**Files:** `src/bot/CookingQuickAskSheet.tsx:93‑95`, `src/bot/cookNote.ts`, `src/recipes/CookCompleteScreen.tsx:109‑116`.
**Current:** the mid‑cook quick‑ask "note" saves a pending cook note (`setPendingCookNote`, keyed per recipe). On Cook Complete it **prefills the "What to change" (refine) field** (`setWhatToChange`), not the log's **Notes**.
**Required:** route mid‑cook notes/questions into the **Notes** field instead — in `CookCompleteScreen`, prefill `notes` (line ~112‑116) from the pending cook note rather than `whatToChange`. Keep the "what to change" field for explicit post‑cook refine intent. Adjust the note prefix in `CookingQuickAskSheet` if needed so it reads naturally as a note ("Mid‑cook: …"). Still clear the pending note after consuming it.

---

# J. Weekly planning — spread cooks across the week (account for leftovers)
**Files:** `src/bot/planningContext.ts`, `src/bot/proposeMealPlanTool.ts`, `src/bot/WeeklyPlanningScreen.tsx` (apply/render), and wherever the accepted plan is written to the planner.
**Current:** `buildPlanningContext` tells the bot to "Plan dinners for these days: <every day>" and `propose_meal_plan` expects one recipe per day — so it plans a cook **every** day, ignoring that a batch cook feeds multiple meals.
**Required:** teach the planner that **each cook yields leftovers** and to **space cooks out**:
1. **Instructions/context** (`planningContext.ts`): state the household context — cooking for **two people**, and each cook typically produces **~2–4 servings of leftovers**, enough to cover lunch and/or dinner for both on at least one following day. Instruct it to **not schedule a cook every day**; instead schedule fewer cooks with **leftover days** in between, and to lean on existing leftovers first.
2. **Tool schema** (`proposeMealPlanTool.ts` / `parseMealPlan`): allow a day to be a **leftover day** — e.g. add an optional `is_leftover: boolean` (and let a leftover day reference the source recipe it's leftovers of, via `existing_recipe_id`), or a day `kind: 'cook' | 'leftovers'`. Update `parseMealPlan` to accept it (a leftover day doesn't require a new cook).
3. **Apply/render** (`WeeklyPlanningScreen`): render leftover days distinctly ("Leftovers · <recipe>") and, on apply, don't create a duplicate cook/plan entry that implies cooking again — represent it as a leftover/no‑cook day.
**Tests:** extend meal‑plan parsing tests for the leftover‑day shape.

---

# K. Audits (do as focused passes)

## K1. Input / keyboard‑avoidance audit
Every file with a `<TextInput>` should keep the focused field visible when the keyboard opens. Files **with** `TextInput` but **no** `KeyboardAvoidingView` today (verify each — some are inside `Sheet`/modal components that may already handle it, or use `RecipeFormScreen` which does):
- `src/theme/ThemeCreatorScreen.tsx`
- `src/profile/SettingsScreen.tsx`
- `src/bot/BotSettingsScreen.tsx`
- `src/bot/CookingQuickAskSheet.tsx`
- `src/debug/DebugScreen.tsx`
- `src/household/MemberProfileScreen.tsx`
- `src/household/PairingScreen.tsx`
- `src/household/MemberRecipesScreen.tsx`
- `src/sharing/ManualMergeScreen.tsx`
- `src/recipes/EmojiPicker.tsx`
For each: if a bottom‑area input can be covered by the keyboard, wrap appropriately (standard `KeyboardAvoidingView`, padding/height). The pantry/staple row inputs (C6) are part of this audit. Don't add KAV where inputs are always above the fold or the container already handles it — verify on device.

## K2. Safe‑area audit
`TabShell` applies `insets.top` to the tab content, so **in‑tab** screens inherit top inset — but **full‑screen sub‑flows rendered outside the tab content manage their own insets**, and some don't. Known/likely offenders (the user specifically flagged the **chat history** screen being under the notification bar):
- `src/bot/BotHistoryScreen.tsx` (flagged — add `useSafeAreaInsets` top padding)
- `src/bot/BotReviewScreen.tsx`, `src/bot/BotDiffReview.tsx`, `src/bot/BotSettingsScreen.tsx`
- Household sub‑screens not already inset by `TabShell`: `ManageVisibilityScreen`, `MemberRecipesScreen`, `MemberRecipeDetailScreen`, `MemberProfileScreen`, `PairingScreen`, `SyncLogScreen`, `RatingBreakdownSheet`
- `src/recipes/CookCompleteScreen.tsx`, `RecipeDetailScreen.tsx`, `IngredientsScreen.tsx`, `CostRefreshScreen.tsx`
- `src/sharing/ImportEntryScreen.tsx`, `ManualMergeScreen.tsx`
- `src/profile/StatsScreen.tsx`, `SettingsScreen.tsx`
Go screen by screen: ensure top content clears the status bar/notch and bottom content clears the gesture bar, using `useSafeAreaInsets`. Screens already using insets (per grep) are fine to spot‑check only.

---

## Suggested implementation order
1. **Small polish & prompt items** (fast wins, low risk): B3, B5, H1, H2, H3, I, D3.
2. **Pantry pass** (one file): C1–C6.
3. **Currency** (G).
4. **Cooking Mode** (D1, D2) — needs device testing.
5. **Auto light/dark** (A1).
6. **Bot versions** (B2) + **theme‑creator bot** (B4) + **copy** (B1).
7. **Weekly planning** (J).
8. **Back button** (F) — cross‑cutting, its own pass.
9. **Household auto‑sync** (E) — largest; do last, with device testing on the same WiFi.
10. **Audits** (K1, K2) as a final sweep.
