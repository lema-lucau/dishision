# Dishision Bot — Recipe Creation & Refinement Spec

Status: Draft v5 — no open questions remaining
Owner: Lema
Scope: Add a chat-based recipe creation flow, **Dishision Bot**, that works from free-form chat, pasted text, pasted links, or voice — and also from an existing recipe you want to refine — producing a recipe in the same shape as manually created recipes, reviewable and editable via the existing Edit Recipe screen before saving. This spec **is** the recipe-extraction feature (not a separate thing layered on top of one).

Naming: no "AI" terminology in user-facing copy anywhere — always **Dishision Bot**. Internal/technical references (code identifiers, this doc's own scaffolding) can still say AI/LLM where that's genuinely clearer, but every string a user sees should say Dishision Bot.

---

## 1. Goal

Let the user create or refine a recipe by chatting with Dishision Bot instead of typing everything in by hand. Every chat is a **1:1 conversation ↔ recipe draft** pairing — one chat, one recipe being worked on. Input can be:

- free-form chat ("make me something with chicken thighs and rice")
- pasted raw text (copied from a message, notes, a screenshot transcription, etc.)
- a pasted link (recipe blog, etc.) — fetched and extracted automatically
- voice — transcribed to text, inserted into the chat input for the user to review and send (never auto-sent)
- **an existing saved recipe** — opened for refinement rather than started from scratch

The result is always a recipe in Dishision's normal shape, shown in the existing Recipe Edit screen, which the user can accept as-is, hand-edit, or keep refining with Dishision Bot before it's saved.

---

## 2. Entry points

### 2.1 Creating a new recipe
- **"Create with Dishision Bot"** action from the recipe list (alongside the existing manual add-recipe entry point).
- Always opens a **brand-new chat**.
- A **New Chat** button, top-right of the Chat screen, starts a fresh chat + fresh draft at any time.

### 2.2 Refining an existing recipe
- A **"Refine with Dishision Bot"** action on the existing recipe's Edit screen, alongside the current manual-edit UI.
- Starts a new chat seeded with that recipe's current full content as the starting draft, recording which recipe it came from (`bot_chat.original_recipe_id`, §4). The user chats/refines exactly as in the from-scratch flow — same Chat/Review screens, same diff review (§9).
- Similar to the app's existing "Copy & tweak" pattern, except the tweaking is conversational, and it offers a genuine **overwrite** option at save time rather than always forking (§11).

---

## 3. Screens

### 3.1 Chat Screen (default)

- **Mode pills** at top: `Chat` (default) · `Paste Text` · `Link`. All three share the same underlying chat/draft — switching modes never loses progress.
- **New Chat** button, top-right.
- Standard chat UI: message bubbles, text input, send button.
- **Mic icon** in the input bar: tap to record, tap to stop (or auto-stop on silence). Transcribed text lands in the input field for review/edit — **not auto-sent**.
- **"View Generated Recipe" button**: enables once Dishision Bot has produced at least one candidate (for an existing-recipe refine, enabled from the start, pre-filled with the original recipe).
- Assistant replies are conversational; the structured candidate is maintained behind the scenes (§7).

### 3.2 Paste Text Screen
Large multiline field → **"Send to Dishision Bot"** submits as the next chat message, returns to Chat screen.

### 3.3 Link Screen
URL input → **"Fetch & Send"** fetches, extracts (§8), sends as the next chat message, returns to Chat screen. Own loading/error states.

### 3.4 Recipe Review / Edit Screen (existing screen, reused for both flows)

- Pre-filled with Dishision Bot's latest candidate — whether from-scratch or refining an existing recipe.
- **Refine box**: fast one-line refinement without leaving the screen, feeding into the same background chat thread as the main Chat screen.
- **Open Chat** affordance for a longer back-and-forth.
- **Diff review** (§9): changed ingredients and steps get individual accept/reject controls before merging into the draft.
- Manual edits made directly here are just edits — not sent to Dishision Bot. A subsequent refine request works from the current on-screen state, including those manual edits.
- **Save**, with behavior depending on where the draft came from (§11).

### 3.5 Chat History Screen

- List of past chats: recipe name (or placeholder), snippet of last message, last-updated timestamp, most-recent-first.
- Tap → reopens exactly where it left off.
- **Long-press → delete** (with confirmation). Deleting a chat never deletes a recipe already saved from it — only the conversation goes away.

---

## 4. Chat lifecycle & storage

- Up to **50 chats** retained. Creating a 51st **permanently deletes the oldest chat** automatically. Applies uniformly regardless of save status; deleting a chat never touches a recipe it already produced.
- Chats are **persisted continuously** — every message and every recipe-candidate update is written to disk immediately, so an app crash mid-conversation loses nothing.

### Data model additions

```sql
CREATE TABLE bot_chat (
  id TEXT PRIMARY KEY,
  created_at TEXT,
  updated_at TEXT,
  source TEXT,                -- 'chat' | 'paste_text' | 'link' | 'existing_recipe'
  source_url TEXT,             -- populated when source = 'link'
  original_recipe_id INTEGER,  -- populated when source = 'existing_recipe'; FK to recipe.id
  recipe_draft_json TEXT,      -- current best-guess recipe candidate (§7 schema)
  saved_recipe_id INTEGER,     -- FK to recipe.id once saved, else NULL
  model_used TEXT,
  lane_aggressiveness TEXT     -- snapshot of the setting in effect when this chat started
);

CREATE TABLE bot_chat_message (
  id TEXT PRIMARY KEY,
  chat_id TEXT REFERENCES bot_chat(id),
  role TEXT,                   -- 'user' | 'assistant'
  content TEXT,
  created_at TEXT
);

CREATE TABLE bot_usage_log (
  id TEXT PRIMARY KEY,
  chat_id TEXT REFERENCES bot_chat(id),
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  estimated_cost REAL,         -- see §12 for calculation
  created_at TEXT
);
```

- On Save, the recipe is written into `recipe`/`recipe_ingredient`/`recipe_step`/`step_lane`, and `bot_chat.saved_recipe_id` is set.
- `bot_usage_log` gets one row per API call — this is what powers the Stats view (§12), no blocking logic attached to it.

---

## 5. Settings — Dishision Bot

Kept out of the main Settings list — nested under its own sub-screen so it's not the first thing anyone poking around the app finds.

- **API key**:
  - Input is **masked** like a password field, with an explicit tap-to-reveal toggle — never shown in plaintext by default.
  - Stored via secure on-device storage (Expo SecureStore), never logged, never included in the app's existing debug-log export.
  - **Never bundled with the app** — this is what keeps the shared APK safe to hand around.
  - **"Test key"** action makes one lightweight API call to confirm it works.
  - Link out for anyone unsure how to generate one: [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys), plus general docs: [docs.claude.com](https://docs.claude.com).
  - If no key is set, both entry points (§2) should say so clearly rather than failing silently once tapped.
- **Model**: `Haiku` (default, `claude-haiku-4-5-20251001`) or `Sonnet` (`claude-sonnet-5`). Both support the tool-based structured output this feature relies on — purely a cost/quality tradeoff, not a capability gate.

### 5.1 Tweakable behavior

All of these feed directly into the system prompt (§7.3) as variables. Global defaults in Settings; each chat snapshots the values in effect when it was created (so changing a setting mid-conversation doesn't retroactively change how that chat behaves), with an option to override per-chat from the chat's own menu.

| Setting | Options | Default | Effect |
|---|---|---|---|
| **Lane splitting aggressiveness** | Never / Balanced / Aggressive | Balanced | How readily Dishision Bot splits steps into parallel lanes |
| **Step detail level** | Brief / Detailed | Brief | Brief matches your existing terse recipe style; Detailed adds more hand-holding for less familiar techniques |
| **Preferred units** | Metric / Imperial | Metric | Which unit system Dishision Bot writes quantities in, regardless of source material |
| **Default servings** | any integer | 2 | What Dishision Bot assumes when the user doesn't specify a serving count |
| **Cooking preferences** (free text) | — | empty | Standing notes injected into every chat automatically, e.g. "no mushrooms, easy on the chilli, Tara doesn't eat pork" — saves repeating yourself every session |

---

## 6. Ingredient matching

Free-text ingredient names from Dishision Bot are matched against `canonical_ingredient` using the same fuzzy search as manual entry. Confident matches auto-attach `canonical_id`.

When nothing matches confidently, the app **auto-creates a new `canonical_ingredient` row** rather than blocking on user input — but that ingredient is **visibly flagged on the Review screen** (e.g. a small "New ingredient" badge next to it) so it's easy to spot and, if it turns out to be a near-duplicate of something that already exists (e.g. Dishision Bot created "spring onion" when "scallion" was already in the database), merge or fix it using the existing ingredient-resolution UI. The flag only needs to persist through the review/save flow — once saved, it's just a normal ingredient like any other.

---

## 7. Dishision Bot integration

### 7.1 Model & call pattern

Every user turn (chat message, pasted text, fetched link content, or refine-box instruction) sends the running conversation to the Anthropic API using the model chosen in Settings.

Structured output is produced via **tool calling** (`propose_recipe`), not JSON embedded in prose — far more reliable to parse. The model calls it whenever it has a candidate to show or update; it can reply in plain text with no tool call for pure clarifying questions.

### 7.2 `propose_recipe` tool definition

```json
{
  "name": "propose_recipe",
  "description": "Propose or update the current best-guess recipe based on the conversation so far. Call this whenever you have enough information to produce a recipe, or when the user has asked for a change and you're supplying the updated version. Do not call this if you are only asking a clarifying question with nothing to show yet.",
  "input_schema": {
    "type": "object",
    "properties": {
      "name": { "type": "string", "description": "A short, appetizing, relevant name for the recipe. Always provide one, even as a first draft — the user can rename it later." },
      "description": { "type": "string" },
      "base_servings": { "type": "integer" },
      "photo_emoji": { "type": "string", "description": "A single emoji that fits the dish." },
      "ingredients": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "display_name": { "type": "string" },
            "quantity": { "type": "number" },
            "unit": { "type": "string" },
            "scalable": { "type": "boolean" },
            "optional": { "type": "boolean" }
          },
          "required": ["display_name"]
        }
      },
      "lanes": {
        "type": "array",
        "description": "Steps grouped into lanes. Use a single lane named 'Main' unless the lane-splitting guidance in the system prompt calls for more.",
        "items": {
          "type": "object",
          "properties": {
            "name": { "type": "string" },
            "steps": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "instruction": { "type": "string" },
                  "phase": { "type": "string" },
                  "effort": { "type": "string", "enum": ["low", "medium", "high"] },
                  "important": { "type": "boolean" },
                  "duration_seconds": { "type": ["integer", "null"] }
                },
                "required": ["instruction"]
              }
            }
          },
          "required": ["name", "steps"]
        }
      }
    },
    "required": ["name", "ingredients", "lanes"]
  }
}
```

Note: `timeline_mode` isn't part of Dishision Bot's output. Like manually created recipes, it's computed automatically by the app from the steps' timing/effort data (active vs. passive cooking time) once they exist — no field for it belongs in this tool schema.

### 7.3 System prompt

Variables in `{{double braces}}` are filled in per chat, from the chat's snapshot of the Settings in §5.1.

```
You are Dishision Bot, a cooking assistant built into the Dishision app. You help {{USER_NAME}} and Tara create and refine recipes through conversation, so they end up with something they can actually cook — not a generic internet recipe.

YOUR JOB
Work with the user to build a single recipe, turn by turn. Every time you have enough information to show a recipe — whether this is the first draft or an update after a refinement request — call the propose_recipe tool with the complete current recipe (not just the changed parts; always send the full ingredient list and full step list, since the app replaces its draft with whatever you send). If you're only asking a clarifying question and have nothing worth showing yet, just reply in text with no tool call.

SOURCE MATERIAL
{{SOURCE_CONTEXT}}
- If the user pasted text or a link, treat it as the primary source: extract it faithfully first, then apply any follow-up refinement requests on top of that extraction. Don't quietly "improve" a pasted recipe unless asked to.
- If this chat started from an existing saved recipe, treat the recipe below (CURRENT RECIPE STATE) as the baseline to refine, not something to rewrite from scratch unless the user clearly asks for that.
- If this is a from-scratch chat request, ask at most one or two clarifying questions if something essential is missing, but prefer a reasonable default (see DEFAULTS below) and let the user correct it over stalling on questions.

DEFAULTS
- Assume {{DEFAULT_SERVINGS}} servings unless the user specifies otherwise.
- Standing preferences to always respect: {{COOKING_PREFERENCES_OR_NONE}}

STEP WRITING STYLE
Detail level: {{STEP_DETAIL_LEVEL}}
- Brief: match the terse, imperative style already used throughout Dishision's recipes — short instructions, no filler, ingredient prep folded into the action. For example: "Chop the onion, carrot and celery." / "Soften the onion, carrot and celery in the same pot." / "Simmer until the potato is completely tender." Avoid restaurant-menu prose, avoid over-explaining basic technique, avoid needless adjectives.
- Detailed: keep the same direct tone, but add brief technique guidance where it genuinely helps (e.g. visual/textural cues for doneness) without turning into a full tutorial.

INGREDIENTS
Use plain, ingredient-database-friendly names in display_name (e.g. "chicken thigh", not "boneless skinless chicken thighs, trimmed of excess fat") — the app matches these against an existing ingredient list. Write quantities in {{PREFERRED_UNITS}} regardless of what unit system the source material used. Keep quantity and unit as separate fields; use a plain count folded into the name for wholes ("2 garlic cloves") per the app's convention for countable items.

LANE SPLITTING
Lane setting: {{LANE_AGGRESSIVENESS}}
- Never: always put every step in a single lane called "Main," regardless of the recipe.
- Balanced: split into parallel lanes only when steps can clearly run at the same time and doing so meaningfully helps timing or coordination (e.g. a sauce simmering while pasta cooks, or a tray roasting while a salad is assembled). Don't split simple single-pan recipes just to have multiple lanes.
- Aggressive: proactively split out any step sequence that could run in parallel, even for modest time savings, as long as it doesn't make the recipe confusing to follow.

RECIPE NAMING
Always give the recipe a real, appetizing name in the name field — never leave it blank or generic like "Recipe 1." The user can rename it anytime, so a good working title is enough; don't ask permission to name it. If refining an existing recipe, keep its name unless the changes are substantial enough to warrant a new one, or the user asks for a rename.

TONE
Keep your conversational replies short and practical — you're a cooking collaborator, not a chatbot performing enthusiasm. It's fine to ask a quick follow-up, note an assumption you made, or flag something odd about a pasted recipe (missing quantity, contradictory step order), but don't pad replies with unnecessary commentary. Never refer to yourself as an "AI" or "assistant model" — you're Dishision Bot.

CURRENT RECIPE STATE
{{CURRENT_RECIPE_JSON_OR_NONE}}
This is the recipe as it stands right now, including any manual edits the user made directly on the review screen (which may not be reflected anywhere earlier in this conversation). Treat it as the source of truth to build on, not your own last tool call.
```

### 7.4 Context window management

Default: **send the full transcript every time, don't summarize** — recipe conversations are naturally short.

- Keep the entire message history verbatim under a generous budget — roughly the last 40–50 messages / ~12k tokens. Almost no recipe chat will get close to this.
- If a chat runs long past that, summarize only the *older* portion, keep the most recent ~10–15 messages verbatim, and always include the current `recipe_draft_json` regardless — the recipe state is tracked independently rather than something the model re-derives from history, so summarization loss has low blast radius.

---

## 8. Link fetching pipeline

1. Fetch the URL's HTML.
2. Run basic content extraction (readability-style: strip nav/ads/comments, keep the main article body) before sending — raw HTML wastes tokens and pollutes extraction with junk.
3. Pass cleaned text through as the next chat message, same extraction path as pasted text.
4. Edge cases: fetch failure → inline error on Link screen; no recognizable recipe → Dishision Bot says so conversationally; JS-rendered empty-shell pages → out of scope for v1, surfaced as "couldn't read this page."

---

## 9. Refinement diff review

Reuses the diff/merge UI already built for duplicate-recipe merging ("pick which changes to take"), extended to compare two recipe candidates instead of two duplicate recipes. Applies identically whether the draft started from scratch or from an existing recipe.

After any refinement produces an updated `propose_recipe` candidate:

- **Recipe-level fields** (name, description, servings, emoji): old → new, each with its own accept/reject.
- **Ingredients**: diffed by matching key (`canonical_id` if resolved, else `display_name`). Each addition, removal, or quantity/unit change is its own row with accept/reject. Unchanged ingredients aren't shown.
- **Steps**: diffed per lane, individually — each added, removed, or reworded step is its own row with accept/reject. Pure reordering (same steps, different sequence, no wording changes) is shown as a single "steps reordered" toggle per lane rather than itemized, since diffing exact reorder logic adds complexity for little practical benefit.
- **"Accept All"** quick action; **"Apply Selected"** merges only checked changes, unchecked ones revert to their pre-refinement value.
- Rejected content isn't lost — it stays visible in the chat transcript, so the user can ask Dishision Bot to bring it back later.

---

## 10. Error & edge-case states

| Situation | Behavior |
|---|---|
| No internet | Entry point disabled or shows "Dishision Bot needs internet" |
| No API key set | Entry point says so and links to Settings |
| API call fails / times out | Retry-able error bubble; refine box shows inline error without clearing the typed instruction |
| Pasted text isn't recipe-like | Dishision Bot asks for clarification rather than fabricating a recipe |
| Link fetch fails | Handled on the Link screen (§8) |
| Voice transcription fails / mic denied | Inline error near the mic icon; falls back to typing |
| App killed mid-chat | Nothing lost — persisted continuously (§4) |

---

## 11. Save flow & origin tagging

- Toggle: **"Mark as Dishision Assisted"** — user's choice. If enabled, sets `origin_label = "Dishision Assisted"` and, if the chat's source was a link, `origin_url` to that link.
- **From-scratch, paste, or link drafts**: Save always creates a new recipe.
- **Existing-recipe refinements** (`bot_chat.original_recipe_id` set): Save presents two explicit options:
  - **Save & Overwrite** — updates the original recipe in place (same `recipe.id`), preserving its cook log, favourites, and household ratings, which all key off that id.
  - **Save as New** — creates a brand-new recipe with the refined content; the original is left completely untouched, mirroring the app's existing "Copy & tweak" pattern.
- Either way, `bot_chat.saved_recipe_id` is set once saved, and the chat remains in history, now linked to the resulting recipe.

---

## 12. Cost & usage visibility (Stats)

No in-app blocking or budget cap — just visibility. Every API call already logs to `bot_usage_log` (§4) with token counts and an estimated cost, computed from current Anthropic pricing:

| Model | Input | Output |
|---|---|---|
| Haiku 4.5 (`claude-haiku-4-5-20251001`) | $1 / MTok | $5 / MTok |
| Sonnet 5 (`claude-sonnet-5`) — introductory, through Aug 31 2026 | $2 / MTok | $10 / MTok |
| Sonnet 5 — standard, from Sep 1 2026 | $3 / MTok | $15 / MTok |

(Current as of Aug 2026 — worth re-checking Anthropic's pricing page before shipping, and updating the rate used in the cost calculation after the Sonnet 5 introductory period ends.)

`estimated_cost = input_tokens × input_rate + output_tokens × output_rate`, stored per-call so it can be sliced by week, by model, or all-time without recomputing from raw tokens every time.

**New Stats screen section — "Dishision Bot":**
- **Overall**: total calls, total tokens (input/output), total estimated cost — shown in **both** USD (exact, matches what's actually billed) and EUR (approximate conversion, using the same conservative flat-rate approximation as before — good enough for a "roughly what has this cost me" figure, not meant to be precise to the cent).
- **Weekly breakdown**: a bar chart of cost per week, both currencies, reusing the same weekly-bar-chart pattern already used elsewhere in Stats (e.g. spend trend, cooks-per-week). Token counts can sit alongside as a secondary figure if there's room, but cost is the headline number.
- **By model**: Haiku vs Sonnet shown separately, since their cost profiles differ enough to be worth seeing apart rather than only combined.

Since there's no in-app cap, the only real backstop against a leaked key racking up charges is a hard spend/usage limit set on the API key or workspace directly in the Anthropic Console — worth setting that up once, independent of anything this app does, since it protects you even if the key were ever used somewhere other than Dishision.

---

## 13. Suggested build order

1. Data model: `bot_chat` / `bot_chat_message` / `bot_usage_log` tables, secure API key storage, Settings sub-screen (key, model, tweakable behaviors from §5.1).
2. Paste Text screen → `propose_recipe` tool call → Review screen pre-fill (the core extraction feature end-to-end, simplest form).
3. Chat screen with multi-turn context + "View Generated Recipe" gating + New Chat.
4. Chat History screen (list, reopen, long-press delete, 50-cap auto-delete).
5. Refine box + diff review UI (§9), reusing the existing merge/diff components.
6. "Refine with Dishision Bot" entry point on the existing recipe Edit screen + Save & Overwrite / Save as New (§2.2, §11).
7. Link screen + content extraction pipeline.
8. Voice input (STT library, mic icon, transcript-before-send behavior).
9. Usage logging + Stats screen section (§12) — cheap to add alongside step 2, since every call already needs to be made; worth wiring the logging in from day one rather than bolting it on later.
