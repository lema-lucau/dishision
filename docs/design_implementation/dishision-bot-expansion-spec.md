# Dishision — Bot Expansion & Polish Spec

Status: Draft v1
Owner: Lema
Supersedes: nothing — this is additive to the shipped Dishision Bot recipe creation/refinement feature.

Scope: two halves.
- **Part A** — expand Dishision Bot from a single recipe-creation surface into several scoped surfaces, on top of a shared session layer, with per-surface enable/disable and a global-vs-per-surface settings split.
- **Part B** — a set of specific bug fixes and polish items across the existing app.

Naming reminder: no "AI" terminology in user-facing copy anywhere. Always **Dishision Bot**.

---

# Part A — Dishision Bot Expansion

## A1. Architecture: one shared core, several thin surfaces

The single most important structural decision here. Every Dishision Bot surface — existing and new — routes through **one shared session layer** rather than each having its own hand-rolled prompt and API-call code.

### A1.1 The shared layer owns

- Bot identity and tone (the "you are Dishision Bot…" preamble)
- Global settings: model choice, preferred units, default servings, step detail level, standing cooking preferences
- API call mechanics: key retrieval from SecureStore, retries, timeouts, error shapes
- Usage logging to `bot_usage_log` — every call from every surface, tagged with which surface it came from
- Context-window budgeting

### A1.2 Each surface contributes only

- A **scoped context fragment** — the specific situational data that surface has (e.g. "the user is currently on step 4 of this recipe", "this recipe was just cooked and the notes say…")
- Its **available tools** — most surfaces get `propose_recipe`; some get none (pure Q&A); weekly planning gets its own
- Its own **surface-specific settings**, if any (§A3)

**Why this matters:** without it, changing the Bot's tone or adding a rule means editing four or five prompts and forgetting one. With it, that's a one-line change in the shared preamble.

### A1.3 Prompt assembly

```
[shared identity + tone]
[global settings block: units, servings default, detail level, cooking preferences]
[surface-specific instructions]
[surface-specific scoped context]
[current recipe state, if the surface has one]
```

Each surface declares its instructions and context fragment; the shared layer assembles, calls, logs, and returns. Surfaces never build a full prompt themselves.

### A1.4 Data model addition

```sql
-- add to existing bot_usage_log
ALTER TABLE bot_usage_log ADD COLUMN surface TEXT;
-- 'recipe_chat' | 'cook_log_refine' | 'cooking_quick_ask' | 'weekly_planning' | 'feeling_fallback'
```

This makes the Stats view able to answer "which Bot feature am I actually using / what's costing me anything" — useful for deciding what to keep.

---

## A2. Surfaces

All five are in scope for this build. Each is individually toggleable (§A3.2).

### A2.1 Recipe Chat (existing — now refactored onto the shared layer)

No behavior change for the user. The existing create/refine chat flow gets rewired to consume the shared session layer instead of owning its own prompt assembly. Tools: `propose_recipe`.

**Plus one addition — quick-start chips (§A2.2).**

### A2.2 Quick-start chips on the empty chat screen

When a new chat is opened and nothing has been typed yet, show tappable suggestion chips above the input rather than a blank screen:

- **"Use up my pantry"** — context fragment includes current `pantry_item` rows (and anything flagged running-low)
- **"Something quick"** — asks for a short total-time recipe
- **"Use up leftovers"** — context fragment includes current `leftover` rows, especially near-expiry ones
- **"Surprise me"** — no extra context, just an open request respecting standing preferences

Tapping a chip fills the input with a sensible starter message (editable before sending, not auto-sent — consistent with the mic behavior) and attaches the relevant context fragment to that turn. Chips disappear once the conversation starts.

### A2.3 Cook Log → Refine

Entry point: a **"Refine with Dishision Bot"** action on a cook log entry (and on the Cook Complete screen right after logging).

- Opens a new recipe-refinement chat, seeded exactly like the existing "Refine with Dishision Bot" from the Edit screen (`source = 'existing_recipe'`, `original_recipe_id` set), **plus** a scoped context fragment carrying that cook's feedback:
  - the notes recorded for that cook
  - any substitutions logged
  - the star rating given
  - servings actually cooked vs. the recipe's `base_servings`
- The Bot's opening move should be to acknowledge the feedback and propose a concrete change, not ask an open question — e.g. from a note like "too salty, needed longer in the oven" it should come back with a reduced salt quantity and adjusted timing already proposed, ready for diff review.
- Save behavior is identical to existing refinement: **Save & Overwrite** or **Save as New** (§A4).
- New `bot_chat.source` value: `'cook_log'`, with a new column `origin_cook_log_id` so the chat can be traced back to the specific cook that prompted it.

This closes the loop that's currently open: cook feedback is captured but never acted on.

### A2.4 Cooking Mode Quick-Ask

Entry point: a small, unobtrusive Bot affordance within the step-lane cooking view.

- Opens a **lightweight sheet**, not the full chat screen — you're mid-cook, possibly with messy hands.
- Scoped context: the current recipe, the specific step the user is on, and the recipe's ingredient list. Deliberately narrow.
- **No `propose_recipe` tool** — this surface answers questions, it does not silently rewrite the recipe you're in the middle of cooking. That's an important safety property: nothing you ask mid-cook can mutate the recipe underneath you.
- Answers should be short — one or two sentences. The shared tone instruction gets a surface-specific override emphasizing brevity here.
- Suggested quick chips: "Can I substitute…", "Is this done?", "What does this mean?"
- If the user wants an actual recipe change based on something they learned mid-cook, the sheet offers a "refine this recipe after cooking" action that just makes a note — it doesn't start a refinement mid-cook.

### A2.5 Weekly Planning

Entry point: from the Home screen and/or the Day Planner / planned meals area.

- A conversational multi-recipe planning session: "help me plan this week."
- Scoped context: current `pantry_item`, `staple` par levels, `leftover` rows with expiry, existing `planned_meal` entries for the target week, recently cooked recipes (recency window, same data the recommendation engine uses), household ratings, and standing preferences.
- **New tool: `propose_meal_plan`** — returns a set of day-slot assignments, each either referencing an existing saved recipe by id or (optionally) a new recipe to be created:

```json
{
  "name": "propose_meal_plan",
  "description": "Propose a set of meals for the requested days. Prefer existing saved recipes where they fit; only propose a new recipe where nothing suitable exists.",
  "input_schema": {
    "type": "object",
    "properties": {
      "days": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "date": { "type": "string", "description": "ISO date" },
            "existing_recipe_id": { "type": ["integer", "null"], "description": "Reference a saved recipe where one fits." },
            "new_recipe_name": { "type": ["string", "null"], "description": "Only if proposing something not already saved." },
            "reasoning": { "type": "string", "description": "One short line on why this fits — e.g. uses up leftovers, haven't cooked in a while, quick on a busy day." }
          },
          "required": ["date"]
        }
      },
      "notes": { "type": "string" }
    },
    "required": ["days"]
  }
}
```

- Review screen for the plan: each day shown with the proposed recipe and its one-line reasoning, each individually accept/reject (same interaction pattern as the ingredient/step diff review — consistent, and reuses that thinking).
- Accepting writes `planned_meal` rows. Any `new_recipe_name` entries become a "create this with Dishision Bot" action rather than being auto-generated — one tap to spin up a normal recipe chat pre-seeded with that name and the week's context.
- After accepting, offer **"Generate shopping list"**, which routes into the existing shopping-list generation flow using the newly planned meals — no new shopping logic needed, just wiring.

**Note on scope:** this is the biggest of the five surfaces and the one most likely to need iteration on prompt quality. Worth building last, and worth being willing to cut back to "propose 3-4 recipes, no day assignment" if full week-planning proves fiddly.

### A2.6 "I'm Feeling" fallback

On the "I'm feeling" screen, when the user's selected criteria produce **no exact match** and only close/partial matches:

- Show the close matches as normal, but add a clear **"Create this with Dishision Bot"** option alongside them.
- Tapping it opens a new recipe chat pre-seeded with the criteria the user selected, phrased naturally — e.g. "Something light, quick, and vegetarian, using what's in the pantry."
- Also attach the pantry/leftover context fragment, since "nothing matched" often means "make me something from what I have."
- Only appears in the no-exact-match case — not a permanent fixture on the screen, so it stays meaningful rather than becoming furniture.

---

## A3. Settings restructure

### A3.1 Global vs. per-surface split

Settings → Dishision Bot, reorganized into three groups:

**Connection (unchanged)**
- API key (masked, tap-to-reveal, Test key action, links to `console.anthropic.com/settings/keys` and `docs.claude.com`)
- Model: Haiku (default) / Sonnet

**Global behavior — applies to every surface**
| Setting | Options | Default |
|---|---|---|
| Preferred units | Metric / Imperial | Metric |
| Default servings | integer | 2 |
| Step detail level | Brief / Detailed | Brief |
| Cooking preferences | free text | empty |

**Per-surface behavior — only shown where relevant**
| Setting | Applies to | Options | Default |
|---|---|---|---|
| Lane splitting aggressiveness | Recipe chat, cook log refine | Never / Balanced / Aggressive | Balanced |
| Planning horizon | Weekly planning | 3 days / 5 days / 7 days | 7 days |
| Prefer existing recipes | Weekly planning | Strongly / Balanced / Happy to suggest new | Strongly |

The point of the split: lane aggressiveness is meaningless for a mid-cook quick-ask, and showing it there (or in one undifferentiated list) makes the settings screen confusing. Each surface's section shows only what actually affects it.

Per-chat snapshotting behavior stays as-is: a chat captures the settings in effect when it was created, so changing a global setting later doesn't retroactively alter an in-progress conversation.

### A3.2 Per-surface enable/disable

A simple list of toggles, all **on** by default:

- Recipe creation & refinement
- Cook log refine
- Cooking mode quick-ask
- Weekly planning
- "I'm feeling" fallback

When a surface is off, its entry point is hidden entirely (not shown-but-disabled) — a hidden button is cleaner than a greyed one for something you've deliberately turned off. Turning off "Recipe creation & refinement" hides the main create/refine entry points but does not delete existing chat history.

This exists because some of these surfaces are speculative. If the mid-cook quick-ask turns out to be annoying in practice, you can kill exactly that one without touching anything else — rather than facing an all-or-nothing decision about a feature set you're partly guessing at right now.

---

## A4. Unchanged behaviors (for Claude Code's benefit)

Explicitly carrying forward from the shipped feature, so nothing gets accidentally rewritten:

- Chat ↔ draft is 1:1; one recipe per chat.
- 50-chat cap, oldest permanently deleted on overflow.
- Continuous persistence — crash mid-chat loses nothing.
- Diff review with fine-grained per-ingredient / per-step accept-reject; "Accept All" and "Apply Selected".
- Save & Overwrite (preserves `recipe.id`, and therefore cook log, favourites, household ratings) vs. Save as New.
- "Mark as Dishision Assisted" toggle at save time, setting `origin_label` / `origin_url`.
- Structured output via tool calling, never JSON-in-prose.
- Voice: transcribe into the input field, never auto-send.
- Usage logged per call; Stats shows cost in both USD and EUR.

---

# Part B — Fixes & Polish

## B1. Keyboard covering text inputs

**Problem:** inputs on the Paste Text screen and the refine box get hidden behind the on-screen keyboard.

**Fix:** apply the same keyboard-avoidance approach already used successfully elsewhere in the app — match the existing pattern rather than introducing a new one, so behavior stays consistent and there's one approach to maintain.

Screens to audit and fix:
- Paste Text screen (multiline input)
- Refine box on the Review/Edit screen
- Chat screen input bar
- Link screen URL input
- Cooking-mode quick-ask sheet (new — get it right from the start)
- Any other multiline inputs surfaced during the audit (cook log notes is a likely candidate)

Acceptance: with the keyboard open, the focused input and its send/submit control are both fully visible, and the chat transcript scrolls to keep the latest message in view.

## B2. Large text clipping descenders

**Problem:** in large-text contexts (Home screen headings especially), descenders on `g`, `y`, `p`, `q`, `j` are being cut off.

**Cause:** almost always a `lineHeight` set too tight relative to `fontSize`, or a fixed-height container clipping the text node.

**Fix:**
- Audit large-text styles and ensure `lineHeight` is comfortably greater than `fontSize` — roughly 1.2–1.3× as a baseline for display sizes, more if the typeface is tall.
- Remove or relax fixed heights on containers wrapping large text; let them size to content.
- Check both fonts in play — the app's display face and JetBrains Mono for numbers may need different ratios.
- Verify specifically with a string containing descenders (e.g. "Happy Tuesday, Lema") rather than text that happens not to have any.

Acceptance: no descender clipping at any text size on the Home screen or anywhere else large text appears, on both a small and large device.

## B3. Onboarding: name and profile picture

Add to the onboarding flow, for the **primary user only** (Tara's profile stays handled in the existing Household screen):

1. **Name prompt** — required, single text field. Feeds the existing user identity mechanism, so all user-facing name rendering continues to derive from the identity table at runtime rather than being hardcoded.
2. **Profile picture** — offered two ways:
   - Pick an image from the photo library (routing through the existing image-picker + crop pipeline already used for recipe photos)
   - Choose an emoji instead
   - **Skip** — explicitly allowed, and clearly presented as a real option rather than buried. On skip, assign a **random emoji** automatically so the user always has *something* rather than a blank avatar.
3. Both should be editable later from Settings — onboarding decisions shouldn't be permanent.

Acceptance: a user can complete onboarding by entering a name and tapping skip, and ends up with a name plus a randomly assigned emoji avatar.

## B4. Cook Log grouping

Add **two tabs** to the Cook Log screen:

**Tab 1 — All (chronological)**
Current behavior, unchanged: a flat list of every cook, most recent first.

**Tab 2 — By Recipe**
- Grouped by recipe, each row showing recipe name, total times cooked, last cooked date, and average rating.
- Tapping a group opens that recipe's cook history — every individual cook of it, with date, rating, servings, notes, substitutions, photos.
- Within that history, the user can **flip through individual cooks** (swipe or prev/next controls) rather than backing out to the list between each one — this is the main thing that makes comparing "how did it go last time vs. the time before" actually pleasant.
- Sensible sort options for the group list: most cooked / most recent / highest rated.

Tab selection should persist across app launches so whichever view you prefer is the one you get.

## B5. Ingredient naming — no prep descriptors

**Problem:** Dishision Bot returns things like "Chicken Breast, Diced" or "Parmesan, grated", which create spurious new `canonical_ingredient` rows that duplicate existing ones.

**Fix — two layers, both worth having:**

**Layer 1: system prompt instruction** (add to the shared INGREDIENTS block)

```
Ingredient names must be the plain ingredient only — never include preparation, state, or serving descriptors. Write "chicken breast", not "chicken breast, diced". Write "parmesan", not "parmesan, grated". Write "onion", not "finely chopped onion". Do not append things like diced, chopped, grated, minced, sliced, softened, melted, room temperature, to serve, for garnish, or divided.

Preparation belongs in the steps, not the ingredient name. If an ingredient needs to be diced, say so in the step that uses it ("Dice the chicken breast."). If something is only for serving or garnish, say that in the relevant step. The app matches ingredient names against an existing ingredient database, and prep descriptors create duplicate entries that should be the same ingredient.
```

**Layer 2: normalization on ingest** (defensive — don't rely on the prompt alone)

Before matching against `canonical_ingredient`, strip a known list of trailing prep/serving descriptors from `display_name`:
- Comma-suffix form: split on the first comma and discard the remainder when the remainder matches a known descriptor list (diced, chopped, finely chopped, grated, minced, sliced, shredded, cubed, julienned, softened, melted, beaten, divided, to serve, to taste, for garnish, room temperature, etc.)
- Leading-adjective form: strip known leading prep words ("finely chopped onion" → "onion")
- Preserve genuine varietal distinctions — this is the important edge case. "Smoked paprika" is a different ingredient from "paprika"; "ground cumin" may legitimately differ from "cumin seeds" in your database. The descriptor list must only contain *preparation* words, never varietal or form words that change what the ingredient actually is. When in doubt, leave it alone — a false negative (descriptor left in) is a minor annoyance, a false positive (collapsing two genuinely different ingredients) corrupts data.

Layer 2 matters because the prompt will be right most of the time but not every time, and a single slip creates a database row that persists.

Also worth doing: a one-off pass to identify and merge any duplicate `canonical_ingredient` rows already created by this bug, using the existing ingredient-resolution/merge UI.

## B6. Sync Log detail

**Problem:** the sync log says a sync happened but not what was in it.

**Fix:**

- Each sync log entry becomes **tappable**, opening a detail view listing every item in that sync, grouped by type:
  - **Recipes** — name, and whether it was added, updated, or skipped as duplicate
  - **Ratings** — the rating value, who gave it, and **which recipe it belongs to** (currently missing entirely and the most confusing gap)
  - **Cook logs** — recipe name and date
  - Anything else the sync carries (shopping lists, pantry, etc.) — same treatment
- Every listed recipe is **tappable and navigates to that recipe**. Same for ratings — tapping navigates to the rated recipe.
- Summary line on the log entry itself should be specific: "5 recipes, 3 ratings" rather than a bare "sync completed".
- Handle the deleted-recipe case: if a synced recipe has since been deleted locally, show it as unavailable rather than crashing or navigating nowhere.

Data model: this likely requires persisting per-item sync detail rather than just a summary row — a `sync_log_item` table keyed to the sync log entry, with item type, target id, target name snapshot (so it still displays if the target is later deleted), and action taken.

## B7. Don't save empty chats

**Problem:** opening Dishision Bot always creates a chat, so history fills with empty chats from times you opened it and backed out.

**Fix:** don't persist a chat until it has real content — specifically, until the first user message is actually sent. Before that it exists only in memory.

- Opening Dishision Bot and immediately backing out leaves no trace.
- The 50-chat cap only ever counts chats with content, so empty ones can't push out real history.
- Edge case: an existing-recipe refinement or cook-log refinement chat that's opened and abandoned without sending anything should also not persist, even though it has a pre-seeded draft — no user message means no real chat.
- Also worth a one-off cleanup on first launch after this ships: delete any existing zero-message chats already in history.

## B8. Chat History: multi-select delete

Add a multi-select mode to the Chat History screen:

- Entered via long-press on a chat (which currently deletes a single chat — long-press should now enter selection mode with that chat selected, which is the more standard pattern and avoids an accidental single-tap-delete).
- In selection mode: tap to toggle chats, a header count ("3 selected"), select-all action, and a delete action with confirmation naming the count.
- Exiting selection mode via back or a cancel action.
- Same deletion semantics as before: deleting chats never deletes recipes that were saved from them.

## B9. Chat History: source pills, colours, and filtering

Each chat in history shows a **pill indicating how it was created**, with a distinct colour per source:

| Source | Pill label | Colour guidance |
|---|---|---|
| `chat` | Chat | Primary teal (`#2D9B8A`) — the default/most common path |
| `paste_text` | Pasted | Warm sand |
| `link` | Link | Terracotta |
| `existing_recipe` | Refined | Amber |
| `cook_log` | From Cook | A distinct fifth hue that fits the existing palette |

Exact values should be pulled from the active theme rather than hardcoded, so pills work across all seven themes (Hearth, Ember, Seaglass, Clay, Risograph, Midnight Kitchen, Dusk) — that's a real constraint worth flagging, since a colour that reads well on Hearth may be invisible on Midnight Kitchen.

**Filtering:** a filter row at the top of Chat History lets the user filter by source — multi-select (so "Chat + Link" is possible), with an "All" default. Filter selection can reset on leaving the screen; it doesn't need to persist.

**Chat detail:** the same pill also appears in the chat's own detail/header view, so when a chat is open it's clear where it came from — including the source URL for link-sourced chats, tappable to open the original page.

---

## B10. Suggested build order

Roughly dependency-ordered, with the quick wins early:

1. **B2** (text clipping) and **B1** (keyboard avoidance) — small, self-contained, immediately improve daily use.
2. **B7** (don't save empty chats) — small, and the sooner it lands the less junk accumulates.
3. **B5** (ingredient naming) — prompt change is trivial; do the normalization layer and the duplicate cleanup at the same time, before more bad rows pile up.
4. **B3** (onboarding name + avatar).
5. **B8** and **B9** (chat history multi-select, pills, filtering) — same screen, do together.
6. **B4** (cook log tabs + flip-through).
7. **B6** (sync log detail) — has a data model change, so slightly heavier.
8. **A1** (shared session layer) + refactor existing recipe chat onto it — no user-visible change, but everything in A2 depends on it. Don't skip or shortcut this.
9. **A3** (settings restructure + per-surface toggles).
10. **A2.2** (quick-start chips) and **A2.6** ("I'm feeling" fallback) — the two cheapest new surfaces, good first tests of the shared layer.
11. **A2.3** (cook log refine) — highest value of the new surfaces.
12. **A2.4** (cooking mode quick-ask).
13. **A2.5** (weekly planning) — biggest and most likely to need prompt iteration; last, and cut scope if it fights back.

One deliberate ordering note: the Part B fixes come first because they're mostly small and they affect the app you're using every day right now, whereas the Part A expansion is additive. And within Part A, the shared layer (A1) genuinely must precede the new surfaces — building even one new surface with its own bespoke prompt makes the refactor harder and starts exactly the sprawl the architecture is meant to prevent.
