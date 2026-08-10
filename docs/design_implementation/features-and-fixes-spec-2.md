# Dishision — Features & Fixes Spec (Batch 2)

> **Status:** ready to implement. Authored 2026‑08‑10 on branch `features-n-fixes`, after the first `features-and-fixes-spec.md` batch shipped (commit `2e039e5`).
> **How to use this doc:** each item is self‑contained — the exact files, current behaviour, the required change, and the product decisions already made with the user. Implement in any order; grouped by area. Follow `AGENTS.md`: read the versioned **Expo 54** docs (https://docs.expo.dev/versions/v54.0.0/) before touching any native/config surface (time pickers, etc.).

## Ground rules (apply to every item)
- **Theming:** never import colours statically. Read colour via `useTheme()` and build styles with `makeStyles(theme)`. New colours must come from the theme. On‑photo surfaces use the `theme.onPhoto.*` token pair, not `theme.colors.*` (see B‑item on the Home pill).
- **Safe area:** use `react-native-safe-area-context` (`useSafeAreaInsets`) near any screen edge. See `[[preppie_safe_area]]`.
- **Keyboard avoidance:** standard `KeyboardAvoidingView` with `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}` (see `WeeklyPlanningScreen.tsx`). No custom hook — a prior attempt failed and was removed (`[[preppie_keyboard_avoidance]]`).
- **Tests:** pure logic is Vitest (`src/test/**`, mirrors source — `[[preppie_test_layout]]`); snapshots are jest‑expo. Every new pure function here (leftover layout, stats windowing, currency conversion, time formatting, alphabetical sort, lane‑banner selection) gets Vitest coverage.
- **Target devices:** Xiaomi 12 Lite + 13T, both 20:9 (`[[target_devices]]`). Verify against tall, narrow screens.

## Decisions already made (with the user, this batch)
| Area | Decision |
|---|---|
| Theme‑creator bot | Turn the one‑shot palette prompt into a **chat** with a live, **ephemeral** draft. Every bot turn refines the **same** working theme + preview; a **theme pill** categorises the conversation; a **"View generated theme"** button (tinted with the new theme's own accent) reveals the result. The bot may also set **advanced token overrides**, not just the 3 seeds. Chat clears on close. |
| Theme‑creator bot modal | Move from the bottom **Sheet** to a **centre modal** (like Add‑ingredients / ConfirmModal). |
| Day/night times | Real **time picker**, not a text field. |
| Day/night theme lists | Sorted **alphabetically** by name. |
| Recipe step time | Add a **seconds** field beside mins; **offset** (mins + seconds) moves to its **own row**. Display shows seconds when present. |
| Cancel cook | New **destructive "Cancel cook"** that discards the session (logs nothing), separate from Complete and Exit. Confirm first. |
| Pantry edit | Remove the **single bin/delete**; keep the existing **multi‑select delete**. |
| Staples | Rename **"Par level" → "Restock at"**; drop the on‑screen explanation. |
| Cooking "Next step" pop‑up | **Remove** the full‑screen takeover modal (it blocks parallel lanes). Replace with **vibrate + lane highlight** (non‑blocking). Retire the full‑screen‑alert setting; keep vibrate. |
| Auto‑advance OFF | No confirm dialog. Steps **don't** auto‑advance; the **master clock keeps running** so the cook sees pacing. The **forward arrow advances instantly**. Add a **"Reset step timer"** button (with confirm) to go back to a previous step and restart its timer after an accidental advance. Show a **dismissable banner** telling the cook to start `LANE_NAME` whenever a parallel lane is idle. |
| Leftover planner | **N = calendar days** to fill. **App computes** the cook‑vs‑leftover pattern deterministically; the bot only picks **which recipe** fills each fresh‑cook slot. A cook covers `floor(servingsMade ÷ householdSize)` days (**servings‑driven**); gap days auto‑fill as leftovers of the preceding cook. |
| Stats filter pills | `1d / 7d / 14d / 30d / 90d / All`, default **30d**. They drive **every** figure on the page. Charts use **adaptive granularity**: per‑day bars ≤14d, per‑week bars for 30d/90d/All. |
| Stats currency chart | A conversion chart at the very bottom: total spend converted (via **static rates**) into **only the currencies the user has used** (their shortlist). Conversion is **stats‑only**; ingredient values never convert elsewhere. Respects the filter pills. |
| Household visibility | Add **meal‑type sections/filter** (Breakfast / Lunch / Dinner / Dessert) to make it easy to bulk‑toggle by course. |
| Debug logs | **Pagination** with **50 / 100 / 150 / 200** per page. |

---

# A. Theming

## A1. Theme‑creator bot: chat + live preview + advanced overrides
**Files:** `src/theme/ThemeCreatorScreen.tsx` (primary), `src/bot/proposeThemeTool.ts`, `src/bot/botSession.ts` (`runSurfaceTurn`), pattern reference `src/bot/WeeklyPlanningScreen.tsx` (multi‑turn history), `src/theme/customTheme.ts` (`OVERRIDABLE_TOKENS`).

**Current:** the bot is a one‑shot. `ThemeCreatorScreen.generatePalette()` (`ThemeCreatorScreen.tsx:75`) sends a **single** user message (`messages: [{ role: 'user', content: prompt }]`, line 90) with **no history**, so every message is treated as brand new — the model can't build on "make it warmer" / "more contrast". It opens in a bottom `Sheet` (`botSheetOpen`, line 336), asks its one question, fills the seed fields, and closes. `PROPOSE_THEME_TOOL` only returns mode + 3 hex seeds + name — it cannot touch the advanced/derived tokens.

**Required:**
1. **Turn it into a conversation.** Keep a `messages: {role, content}[]` array (like `WeeklyPlanningScreen`). Each send appends the user turn, calls `runSurfaceTurn` with the **full history**, appends the assistant reply, and applies any `propose_theme` tool result to the **working draft**. History lives only in component state — **ephemeral**: opening the creator (or the theme chat) starts fresh; closing discards it. No persistence, no chat list.
2. **One live draft, refined in place.** A `propose_theme` result updates the existing `mode` / `seed` / `overrides` state that already drives the live `builtTheme` preview at the top of the creator (`previewCard`, line 200). Refinements mutate the **same** draft rather than starting over, so "warmer" adjusts the current colours. Do **not** wipe `overrides` on every turn (current line 102 does `setOverrides({})`) unless the tool call itself supplies a fresh full palette — merge token overrides the bot returns onto the current set.
3. **Advanced overrides from the bot.** Extend `PROPOSE_THEME_TOOL` (`proposeThemeTool.ts`) with an optional `overrides` object: a map of `OVERRIDABLE_TOKENS` keys → hex. Update `parseProposedTheme` to normalise/validate each (reuse `normalizeHex`, drop unknown keys and bad hex). Update the tool description + the `instructions` string (line 86) to tell the bot it *may* fine‑tune individual tokens via `overrides` (e.g. nudge `ink2`, `amber`, a category colour) after setting the three seeds — and that it should not be shy about it when the user asks for a specific tweak. Applying: `setOverrides(prev => ({ ...prev, ...proposed.overrides }))`.
4. **Theme pill on the chat.** Render a small pill/chip labelling the conversation as a theme chat (e.g. "🎨 Theme" using `accentTint`/`accentText`), so it reads as a distinct surface, matching how recipe chats are badged.
5. **"View generated theme" button, tinted with the new theme.** After a turn that produced a palette, show a prominent button reading **"View generated theme"** (not "recipe"). Its background/foreground use the **newly generated** theme's own `accent` / `accentFg` (from `builtTheme.colors`), so the user visibly sees the bot changed something. Tapping it opens the existing full‑screen `ThemePreview` (`previewing` state, line 168) where Save / Save & apply already live. Keep the manual seed rows + Advanced section fully usable alongside the chat.

**Notes:** the bot surface stays gated by the existing `getSurfaceEnabled(db, 'theme_creator')` toggle (line 72). Usage is already tagged `surface: 'theme_creator'` for the stats page. Keep "never auto‑save" — the user always reviews before applying (§B4 of batch 1).

## A2. Theme‑creator bot modal → centre modal
**Files:** `src/theme/ThemeCreatorScreen.tsx` (the `Sheet` at line 336), `src/components/ui` (whatever the app's centre‑modal primitive is — the same one Add‑ingredients uses; e.g. `ConfirmModal` / a centered `Modal`).

**Current:** the bot chat renders inside a bottom `Sheet` (`<Sheet visible={botSheetOpen} …>`), which "hovers" slightly off the bottom rather than being anchored, and looks inconsistent with the app's other **centre** modals.

**Required:** present the theme‑bot chat (from A1) as a **centred modal** — vertically/horizontally centered card with a scrim — matching the Add‑ingredients modal and `ConfirmModal`. Keep it keyboard‑avoiding (the input must stay visible while typing). Reuse the existing centre‑modal component rather than restyling the `Sheet`.

## A3. Day/night switch — real time picker
**Files:** `src/theme/ThemePickerScreen.tsx` (Auto day/night section, batch‑1 A1), `src/theme/ThemeContext.tsx`, settings keys `theme_day_time` / `theme_night_time` (stored `HH:MM` 24h). Reference: `src/components/DatePickerModal.tsx` (existing calendar picker — **date only**, not reusable for time).

**Current:** batch‑1 A1 shipped the day/night times as editable **text entry** (`HH:MM`). The user wants a proper picker so they don't hand‑type times.

**Required:** replace the two time text fields with a **time picker**. Tapping a time opens a picker (native time mode via `@react-native-community/datetimepicker` in `mode="time"`, **or** a small themed hour/minute wheel consistent with the app — check Expo 54 docs before adding a native dep; if the community picker isn't already installed, `npx expo install @react-native-community/datetimepicker`). Persist back to the same `HH:MM` strings. The `themeIdForTime` / `nextBoundaryMs` helpers (`src/theme/autoThemeSchedule.ts`) are unchanged.

## A4. Alphabetical day/night theme lists
**Files:** `src/theme/ThemePickerScreen.tsx` (the Day‑theme + Night‑theme pickers in the Auto day/night section), theme source `src/theme/themes.ts` + `useCustomThemes()`.

**Current:** the Day/Night theme choosers list themes in definition/insertion order, making a specific theme hard to find.

**Required:** sort the theme options **alphabetically by display name** (case‑insensitive, locale‑aware `localeCompare`) wherever the day/night pickers list themes (built‑in + custom, merged then sorted). Add a tiny pure `sortThemesByName(themes)` helper with a Vitest test. (Scope: the auto day/night pickers specifically — the main theme grid/library ordering is out of scope unless trivial to share.)

## A5. Dark‑mode "Planned · Dinner" pill contrast
**Files:** `src/components/ui/HeroCover.tsx` (`badge` / `badgeText` styles, lines 85–96). Used by Home's tonight's‑plan card (`src/screens/HomeScreen.tsx:258`).

**Current:** the badge background is `theme.onPhoto.chipBg` (a light, photo‑safe chip) but the **text** is `theme.colors.ink` (line 95). In a dark theme `colors.ink` is near‑white, so the white "PLANNED · DINNER" text sits on the light chip and is unreadable.

**Required:** the badge text must use the **on‑photo foreground** token that pairs with `onPhoto.chipBg` (e.g. `theme.onPhoto.ink` / `theme.onPhoto.fg` — use whatever the `onPhoto` group defines as its ink; do not use `theme.colors.ink`). On‑photo tokens are intentionally theme‑mode‑independent, so this fixes both light and dark. Verify the badge is legible over both light and dark photos and in both theme modes. (If the `onPhoto` group lacks an ink token, add one and give it a value with strong contrast against `onPhoto.chipBg`.)

---

# B. Recipe editing

## B1. Step time: seconds field + offset on its own row
**Files:** `src/recipes/RecipeFormScreen.tsx` (step editor, lines ~582–603), display in Recipe detail step list + cooking mode, `src/lib/formatDuration.ts` (`formatDuration` vs `formatDurationPrecise`).

**Current:** the DB already stores **seconds** (`durationSeconds`, `startOffsetSeconds`) — no schema change needed. The editor only exposes **minutes**: Duration is `String(durationSeconds / 60)` ↔ `Number(v) * 60` (lines 587–588), and in **parallel** mode the Offset (mins) field is **squished into the same row** as Duration (lines 591–602). Step badges render with `formatDuration(step.durationSeconds)` (line 521) which shows only whole minutes.

**Required:**
1. **Mins + seconds for Duration.** On the duration row, show two numeric inputs: **Mins** and **Seconds** (0–59). Combine as `durationSeconds = mins*60 + secs` (either blank ⇒ treat as 0 for that part; both blank ⇒ `undefined`). Seconds‑only steps (mins blank) must work.
2. **Offset on a new row.** Move the parallel‑mode **Offset** out of the duration row into its **own row below**: an **"Offset (mins)"** input and, beside it, an **"Offset (seconds)"** input. Combine to `startOffsetSeconds` the same way. Keep the offset row gated on `timelineMode === 'parallel'` as today.
3. **Display seconds when present.** Where steps show their time (the editor badge line 521, Recipe detail step list, and the cooking‑mode step timers), show seconds when the value isn't a whole minute — e.g. `2m 30s`, `45s`, but keep `2m` when seconds are 0. `formatDurationPrecise` already does precise formatting (used in cooking mode); route the recipe/editor displays through a precise formatter (add a `formatMinSec` if the existing ones don't produce the `2m 30s` shape). Add Vitest cases for `0`, `45s`, `120s`, `150s`, `3600s`.

**Notes:** validate seconds inputs to 0–59; if a user types `90` in seconds, either clamp or roll into minutes — clamp to 59 is simplest and predictable. Existing minute‑only recipes are unaffected (their seconds component is 0 and won't render).

---

# C. Cooking Mode

**Shared file for all C items:** `src/recipes/CookingModeScreen.tsx`. Supporting: `src/cooking/lanes.ts` (`laneStatuses`, `lanesReadyToAdvance`, `LaneStatus`), `src/cooking/session.ts` (session mutations), `src/settings/getSetting.ts` (`getCookAutoAdvance`, `alert_*`).

## C1. Remove the full‑screen "Next step" takeover pop‑up
**Current:** on a passive‑timer finish or an important step, the code fires a **blocking** `ConfirmModal` titled "Next step" via `takeoverStep` state (set at lines 317, 386; rendered lines 812–818), gated by the `alert_takeover` setting. With two lanes active this modal interrupts the whole screen and breaks parallel flow. It also fires `Vibration.vibrate(400)` (gated by `alert_vibrate`).

**Required:**
1. **Delete the blocking modal.** Remove the `takeoverStep` state, both `setTakeoverStep(...)` call sites (in `handleAdvance` and `advanceLaneStep`), and the `ConfirmModal` at 812–818. Retire the `alert_takeover` setting and its Settings toggle (the "full‑screen next‑step alert" control) — or repurpose that toggle to control the vibrate/highlight if you'd rather keep one switch; product intent is "no full‑screen interruption".
2. **Keep vibrate.** Preserve `Vibration.vibrate(400)` gated by `alert_vibrate` — the hands‑busy haptic nudge stays.
3. **Add a non‑blocking lane highlight.** When an alert would have fired, briefly **flash/highlight** the relevant lane tab (and/or the step instruction) instead of blocking — e.g. a transient `flashLaneKey` state cleared after ~2.5s that adds an accent pulse/ring to that lane tab in the lane strip (lines 687–713). This replaces the takeover as the visual signal and never steals the screen from the other lane.

## C2. Simplify auto‑advance‑OFF: manual stepping, live clock, no confirm
**Current:** when `autoAdvance` is off, the effect at lines 460–477 pops `confirm('Ready for the next step?', …)` once per due step and only advances on confirm. The forward arrow (`handlePeekForward`, lines 506–538) shows a second confirm ("Move on to the next step?") when advancing past the live step.

**Required (auto‑advance OFF only):**
1. **No auto‑advance, no confirm.** In the lanes effect (460–477), when `!autoAdvance` simply **do nothing** on a due step: don't advance, don't prompt. The due step stays live; its timer keeps counting; drift accrues and the existing "N min behind" banner (lines 663–672) already communicates pacing. Remove the `confirm('Ready for the next step?')` branch entirely.
2. **Forward arrow advances instantly.** Change `handlePeekForward` so that, with auto‑advance OFF, tapping → past the live step **immediately** completes the current step and advances (call the existing advance path directly, no `confirm`). Backward ← still peeks. (Auto‑advance ON behaviour is unchanged — lanes still self‑advance.)
3. **"Reset step timer" button (with confirm).** Because instant advance is irreversible (`completeStep` writes), add a **Reset step timer** control for recovering from an accidental advance:
   - **When shown:** while the **displayed step is behind the live step** (i.e., the cook peeked ← back to an already‑completed step). Place it near the existing "Back to live" button (lines 737–741).
   - **Action (confirmed):** a `ConfirmModal` ("Reset this step's timer?" — "Marks it the current step again and restarts its timer from now."). On confirm, call a new session mutation `resetToStep(db, session, stepId)` that: sets `currentStepId = stepId`; marks that step **and all later steps in its lane** as **not completed**; and **rebases** the step's `actualStartOffset` to now so its countdown restarts (mirror how `advanceToStep` establishes a step's start). Then reload session + step runtime + reconcile notifications, and clear `viewingStepId` so the view snaps to the now‑live step.
   - Add Vitest coverage for `resetToStep` (un‑completes the target + later lane steps, moves the pointer, rebases the clock).

## C3. Auto‑advance‑OFF lane banner ("start LANE_NAME")
**Current:** with auto‑advance off, parallel lanes don't advance on their own, so a second lane can sit idle while the cook works one lane and never gets told to start the other.

**Required:** show a **dismissable banner** whenever a **parallel lane is idle but should be running** and the cook isn't looking at it:
- **Trigger (per the user: "whenever a lane is idle"):** using `laneStatuses`, a lane other than the visible one whose next actionable step is **due/overdue** (state `overdue`, or `waiting` at ~now) and **not yet started**. Add a pure helper `laneBannerTarget(statuses, visibleLaneKey, dismissedLaneKeys): LaneStatus | null` (Vitest‑tested) returning the most urgent such lane, or null.
- **UI:** a banner above the step body reading e.g. **"Start "{LANE_NAME}" now"** / "You'll want {LANE_NAME} going too", with a tappable body that switches to that lane (`selectLane(key)`) and an **✕** to dismiss. Dismissal is per‑lane (`dismissedLaneKeys` set) and stays dismissed while the cook remains on the current step; moving to a new step re‑evaluates (a still‑idle lane may reappear). Style as an accent/amber info banner using theme tokens.
- **Scope:** only when `autoAdvance` is **off** and `showLaneTabs` (more than one lane). With auto‑advance on, lanes self‑advance and the banner is unnecessary.

This keeps the flow "parallelised but still somewhat sequential": the cook moves at their own pace but gets a gentle, dismissable nudge when a second stream should begin.

## C4. Cancel cook (discard session)
**Current:** the only exits are **Complete** (`handleComplete` — cancels notifications + `finishSession`, then `onComplete` logs the cook) and **Exit (keeps your progress)** (`handleExit` — `checkpointSession` + leave; the session is resumable). There is no way to throw a session away.

**Required:** add a **"Cancel cook"** action that **discards the current session entirely** and logs nothing:
- **Placement:** in the active view, near the Exit button (lines 791–793), visually **destructive** (red/`redTint`), clearly distinct from Complete and Exit.
- **Confirm first:** `ConfirmModal` — "Cancel this cook? — Your progress for this session is discarded. Nothing is logged." with a destructive confirm.
- **Action:** cancel notifications (`cancelAllCookingNotifications`) and remove the unfinished session so it is **not** offered for resume and produces **no** `cook_log` row. Add `discardSession(db, sessionId)` to `src/cooking/session.ts` (delete the session + its step‑completion rows; do **not** write a cook log). Then call `onExit()` (not `onComplete`). Contrast with `finishSession`, which is part of the completing/logging path.
- Add a Vitest test that `discardSession` leaves no resumable session and no cook log.

## C5. Remove the "confirm next step" modal that breaks parallel lanes
> This is the same removal as **C1 + C2** — kept as an explicit line item because the user called it out separately. The two dialogs to delete are: the auto‑advance‑OFF `confirm('Ready for the next step?')` (line 475) and the takeover `ConfirmModal` "Next step" (line 812). After C1/C2 there should be **no** step‑advance confirmation modal left in cooking mode. Verify by grepping `CookingModeScreen.tsx` for `confirm(` and the takeover modal — only the C2 "Reset step timer" and C4 "Cancel cook" confirmations should remain.

---

# D. Pantry & Staples

## D1. Remove the single‑item bin delete in pantry edit mode
**Files:** `src/plan/PantryScreen.tsx`, `src/plan/pantryMutations.ts`.

**Current:** pantry edit mode shows a per‑row **bin/trash** delete **in addition to** the pre‑existing multi‑select + bulk delete. The single delete is redundant.

**Required:** remove the per‑row bin/delete icon and its handler from pantry edit mode. **Keep** the multi‑select selection + bulk **Delete** flow exactly as it was. Ensure no now‑dead mutation/import is left behind (only remove the single‑delete call site; keep bulk delete). This applies to the pantry list, including staples shown inline after the batch‑1 pantry/staples merge (`[[features-fixes-spec]]`).

## D2. Rename staple "Par level" → "Restock at"
**Files:** `src/plan/staples.ts` (logic; keep the DB column `par_level` and `parLevel` field names — data layer unchanged), the staples/pantry UI where par level is edited + explained (`src/plan/PantryScreen.tsx` and any staple editor sheet), `src/test/plan/staples.test.ts` (labels only).

**Current:** staples expose a **"Par level"** with an on‑screen explanation. The term confuses users ("does below this mean running low?").

**Required:** rename the **user‑facing label** everywhere it appears from **"Par level"** to **"Restock at"** (e.g. field label "Restock at", helper/placeholder like "Flag as running low below this amount" only if a hint is still wanted). Because "Restock at" is self‑explanatory, **remove the separate explanatory paragraph** on the staples screen. The underlying meaning is unchanged: `runningLow = quantity < restockAt` (the existing `par_level` logic in `staples.ts:52`). Do **not** rename the DB column or the `parLevel`/`setStapleParLevel` code identifiers — this is a copy change only.

---

# E. Leftover‑aware weekly planner

**Files:** `src/bot/WeeklyPlanningScreen.tsx`, `src/bot/proposeMealPlanTool.ts`, `src/bot/planningContext.ts`, new pure module `src/plan/leftoverPlanner.ts` (+ `src/test/plan/leftoverPlanner.test.ts`), `src/cooking/leftover.ts` (existing leftover model for reference). Household size: currently **hard‑coded "two people"** in `planningContext.ts:73,96`.

**Current:** the bot decides the whole arrangement — it returns per‑day entries and self‑flags `is_leftover` days (`proposeMealPlanTool.ts`). Per the user this is unreliable: the model doesn't reliably space cooks or backfill gap days, and it costs an AI call to do scheduling arithmetic the app can do exactly.

**Required — deterministic layout, bot picks recipes only:**

1. **N = calendar days to fill.** The chosen horizon (existing `horizon` weekly‑planning setting: the 3/5/7‑day options) is the **span of calendar days** starting from the week/first day. The app fills every day in the span; some are fresh cooks, the rest are leftovers.

2. **Servings‑driven coverage.** A cook made with `servingsMade` total servings feeds `meals = max(1, floor(servingsMade ÷ householdSize))` meals. That cook occupies its **cook day plus `meals − 1` leftover days**. Use each recipe's `baseServings` as `servingsMade` (a saved recipe's default batch). **Household size:** read a `household_size` setting (default **2**); replace the hard‑coded "two people" in `planningContext.ts` with this setting so the prompt and the math agree. Add the setting to `getSetting.ts` with default 2 (a Settings control for it is nice‑to‑have, not required this batch).

3. **App computes the pattern; bot supplies an ordered list of cooks.** Change `propose_meal_plan` so the bot returns an **ordered sequence of fresh dinners** (each an `existing_recipe_id` or a `new_recipe_name`, with a one‑line reason) — **without** dates and **without** `is_leftover`. The app assigns dates and inserts leftover days. Concretely:
   - New/edited tool: `propose_meal_plan` returns `cooks: [{ existing_recipe_id?|new_recipe_name?, reasoning }]`, ordered, enough to fill the span in the worst case (i.e. up to `spanDays` cooks — the app stops early once the span is covered). Keep `notes`. Remove `is_leftover` from the tool contract (the app owns leftovers now). Update `parseMealPlan` accordingly.
   - New pure function `layoutLeftoverPlan({ cooks, startDate, spanDays, householdSize, servingsOf }): PlannedDay[]` where each `PlannedDay` is either `{ date, kind: 'cook', cook }` or `{ date, kind: 'leftover', sourceCook }`. Algorithm:
     ```
     cursor = 0; i = 0
     while cursor < spanDays and i < cooks.length:
       cook = cooks[i]; i++
       date = startDate + cursor
       push { date, kind: 'cook', cook }
       meals = max(1, floor(servingsOf(cook) / householdSize))
       for k in 1..meals-1:
         if cursor + k >= spanDays: break
         push { date: startDate + cursor + k, kind: 'leftover', sourceCook: cook }
       cursor += meals
     // if cooks run out before the span is filled, remaining days stay empty
     // (the UI shows them as "needs a cook" — or request more cooks from the bot)
     ```
     This naturally produces the user's example: cook Mon → (4 servings ÷ 2 = 2 meals) Tue leftover → cook Wed → Thu leftover → cook Fri …; and a gap day like Thursday auto‑fills from Wednesday's cook.

4. **UI (`WeeklyPlanningScreen`).** After a turn, run `layoutLeftoverPlan` over the bot's `cooks` and render the resulting days. Reuse the existing card treatment: **cook days** get the accept checkbox + (for new recipes) the "Create with Dishision Bot" action; **leftover days** render as the existing dashed `leftoverCard` with the "Leftovers · {source recipe}" label (lines 292–294) and are **not** applied as cooks (the existing `if (day.isLeftover) continue;` guard in `applySelected`, line 132, carries over — now keyed off `kind === 'leftover'`). "New recipe" cook slots still surface **Create with Dishision Bot** and are not auto‑created (unchanged).
   - A leftover day's servings assumption comes from the source cook's `baseServings`; if the user later changes planned servings, coverage recomputes on the next generate. Keep it simple — recompute the layout whenever a new plan/refine turn arrives.
   - **Refine** still works: the refine box asks the bot for a different **ordered cook list**; the app re‑lays it out. The bot never has to reason about leftover spacing.

5. **Prompt/instruction updates (`planningContext.ts`).** Rewrite `instructions` + `contextFragment` so the bot is told: "Return an **ordered list of fresh dinners** to cook across the next {span} days — the app schedules leftover days between them automatically based on batch size, so **do not** mark leftover days or assign dates yourself. Space variety across the list; prefer existing saved recipes per the user's preference; only name a new recipe when nothing saved fits." Keep the catalogue, recently‑cooked, pantry, and existing‑leftover context. Reading household size from the setting (step 2).

6. **Tests:** `layoutLeftoverPlan` — 2‑serving recipe (cooks daily, no leftovers), 4‑serving/household‑2 (cook + 1 leftover), 6‑serving (cook + 2 leftovers), span truncation (leftover tail cut at span end), cooks list shorter than span (trailing empty days), gap backfill (the Mon/Wed/Fri example). `parseMealPlan` — new `cooks` shape, dropping malformed entries.

**Notes:** this removes leftover scheduling from the model entirely — deterministic, testable, and cheaper (the bot only chooses recipes). The `is_leftover` path in the current tool/screen is replaced, not extended.

---

# F. Stats

**Files:** `src/profile/StatsScreen.tsx`, `src/profile/loadStats.ts`, `src/bot/usageRepo.ts` (`loadBotUsageStats`), `src/lib/currency.ts`, new `src/lib/currencyRates.ts` (+ tests), `src/test/profile/loadStats.test.ts`.

## F1. Time‑window filter pills driving the whole page
**Current:** `loadStats(db, weeks = 12, now)` computes some figures over **all time** (`totalCooks`, `avgRating`, `totalSpend`, `avgMacros`, distributions), some over a fixed **last‑30‑days** window (`cooksLast30`, `cookedDaysLast30`), and per‑**week** series over a fixed **12 weeks**. `StatsScreen` loads once (`loadStats(db).then(setStats)`, line 198). There is no user control.

**Required:**
1. **Pills at the very top.** Render a pill row `1d · 7d · 14d · 30d · 90d · All`, default **30d** on open. Selecting a pill re‑derives the whole page for that window.
2. **`loadStats` takes a window.** Refactor to `loadStats(db, { windowDays: number | null /* null = All */, now })`. **Every** figure is computed within the window:
   - Headline cards (`totalCooks`, `distinctRecipesCooked`, `avgRating`, `totalSpend`, `avgKcal`, `avgMacros`, `mostCooked`, protein/tag distributions) → filter `logs` to `cooked_at >= now − windowDays` (all‑time when `null`).
   - The two "last 30" cards become **windowed**: relabel dynamically — "times cooked in the last {window}" / "active cooking days ({window})". For `All`, phrase as "total".
   - **Trends** ("recent vs previous") compare the recent half vs previous half **within** the window.
3. **Adaptive‑granularity series.** Replace the fixed weekly buckets with a `series` whose bucketing depends on the window: **per‑day** bars for `1d / 7d / 14d`, **per‑week** bars for `30d / 90d / All`. Produce a generic `buckets: { key, label, value }[]` for each metric (cooks, rating, calories, spend, and bot cost). `BarChart` already selects/averages bars — feed it the adaptive buckets and appropriate axis labels (day label vs `weekLabel`). Keep the "tap a bar / tap again for average" behaviour. Add a pure `bucketize(logs, window, valueFn)` helper with Vitest coverage (daily vs weekly boundaries, empty windows, All).
4. **Bot usage respects the filter too.** `loadBotUsageStats` must accept the same window so the **Dishision Bot** section (overall cost, per‑week→per‑bucket cost chart, by‑model, by‑feature) reflects the selected window. Re‑derive its buckets with the same adaptive granularity.
5. **Screen wiring.** `StatsScreen` holds `windowDays` state (default 30), re‑runs `loadStats` + `loadBotUsageStats` on change, shows a light loading state on the affected sections. Keep everything theme‑tokenised.

**Notes:** short windows will legitimately show few/one bar(s) — adaptive granularity (per‑day) keeps them meaningful. Guard divide‑by‑zero and empty windows (already patterned in `avg`/`computeTrend`).

## F2. Currency‑conversion chart at the bottom of Stats
**Current:** spend is shown only in the active currency's symbol; **no conversion anywhere** (by design — `lib/currency.ts` is symbol‑only). The user wants a **stats‑only** view of total spend expressed in each currency they use, using rough static rates. This must **not** change ingredient values elsewhere.

**Required:**
1. **Static rate table.** New `src/lib/currencyRates.ts`: a hard‑coded approximate rate table keyed by the currency `name` used in `lib/currency.ts` (EUR, USD, GBP, AUD, NZD, CAD, JPY, CNY, CHF, INR, SEK, NOK, DKK, ZAR, SGD, HKD, BRL, MXN, PLN, KRW — the `PRELOADED_CURRENCIES` set). Store rates against a single base (e.g. **1 unit = X USD**, or a `perEUR` map) and derive cross‑rates: `convert(amount, from, to) = amount * rate[from] / rate[to]`. Values are **intentionally approximate and static** — comment loudly that they never update and are for rough visualisation only. Unknown currency name ⇒ skip (return null). Vitest: round‑trip sanity, cross‑rate via base, unknown currency.
2. **Chart placement + content.** At the **very bottom** of the Stats page, a card: take the **windowed** `totalSpend` (the number the user actually recorded, in their **active** currency — no per‑ingredient conversion), and show it converted into **each currency the user has used** — i.e. their current **shortlist** (`parseShortlist` / the persisted shortlist), excluding the active one (or showing it first as the source). Present as a small ranked/list chart (reuse `RankedBars`‑style rows or simple rows: `A$ 42.10`, `£ 24.05`, …) with a one‑line "rough static rates — for comparison only" hint.
3. **Respects the filter pills (F1).** The converted total is the **windowed** spend, so changing the pill updates this chart too.
4. **Nowhere else.** Do not wire `currencyRates` into ingredient pricing, recipe cost, pantry, or the rest of stats — only this one chart. Keep `formatCurrency(value, symbol)` for rendering each converted figure with the right symbol (`activeSymbol` / shortlist symbols).

**Notes:** the user was explicit — changing the active currency must **not** re‑value ingredients (that stays symbol‑only). Conversion exists solely on this chart, from the recorded active‑currency total into the user's other used currencies.

---

# G. Household — visibility by meal type

**Files:** `src/household/ManageVisibilityScreen.tsx`, recipe course/meal‑type field on `EnrichedRecipe` (from `loadEnrichedRecipes`).

**Current:** the screen splits recipes into **Public / Private** sections with layout + page‑size controls and per‑section pagination. There's no way to focus on a course (e.g. just desserts) when bulk‑toggling visibility.

**Required:** add a **meal‑type filter** so the user can narrow to **Breakfast / Lunch / Dinner / Dessert** and toggle visibility within that course quickly:
- Add a filter‑chip row (an **"All"** chip + one per meal type) above the Public/Private sections. Selecting a course filters **both** the Public and Private sections to recipes of that course. This matches the user's "start dessert filter, then select the ones you want visible" flow.
- Source the course from the recipe's existing meal‑type/course field (confirm the field name on `EnrichedRecipe`; recipes are already categorised elsewhere in the app — reuse that taxonomy and its labels). If a recipe has no course, keep it under "All" and (optionally) an "Uncategorised" chip.
- Keep the existing Public/Private split, list/grid layouts, page‑size, and pagination — the course filter composes with them (reset to page 1 on filter change, mirroring the existing `pageSize` reset at lines 36–38).
- No bulk "make all public" (the screen's rule is deliberate per‑recipe toggling, per its header comment) — the filter just makes finding a course's recipes easy.

---

# H. Debug log pagination

**Files:** `src/debug/DebugScreen.tsx`, `src/test/debug/DebugScreen.test.tsx`.

**Current:** the filtered logs render in a single `FlatList` (lines 331–339) with no paging — long log sets scroll endlessly.

**Required:** add **pagination** with a per‑page size selector offering **50 / 100 / 150 / 200**:
- A page‑size control (chip row like `ManageVisibilityScreen`'s `PAGE_SIZE_OPTIONS`, but with `[50, 100, 150, 200]`) plus **Prev / Next** and a "Page X of Y" label. Reuse the `ManageVisibilityScreen` pagination pattern (lines 113–131) for consistency.
- Page the **`filtered`** list (after search/level/category/date filters, which already run and reverse). Reset to page 1 when filters or page size change; clamp the current page if it goes out of range (as `ManageVisibilityScreen` does).
- Keep Export/Import/Clear operating on the **full** set (not just the visible page) — those already act on `entries` / `filtered` wholesale; don't scope them to the page.
- Update the header count line (line 231) to read e.g. `{entries.length} logs · {filtered.length} match · page {page}/{pages}`.
- Extend the existing test to cover paging math (page count, clamping, page‑size change resets to 1).

---

## Suggested implementation order
1. **Quick wins / copy:** A4 (sort), A5 (pill contrast), D1 (remove bin), D2 (restock rename), H (debug paging).
2. **Cooking mode cluster (one file):** C1, C2, C3, C4, C5 together.
3. **Recipe editor:** B1 (seconds + offset row).
4. **Theme creator:** A2 (centre modal) → A1 (chat + overrides) → A3 (time picker).
5. **Planner:** E (deterministic leftover layout).
6. **Stats:** F1 (windowing + adaptive charts) → F2 (currency chart).
7. **Household:** G (meal‑type filter).

Each pure module (leftover layout, stats bucketize, currency convert, time formatting, alphabetical sort, lane‑banner target, `discardSession`, `resetToStep`) ships with Vitest coverage; UI changes get a snapshot refresh where one exists.
