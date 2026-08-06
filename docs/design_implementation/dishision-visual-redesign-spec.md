# Dishision — Visual Redesign Spec (Warm Editorial)

**Version:** R1.2
**Companion to:** `dishision-spec.md` (the *base spec*) — this document does **not** replace it
**Platform:** React Native / Expo SDK 54
**Status:** Specification — supersedes the *visual presentation* of the base spec's §4.5–4.8 and the *layout* of §5.2–5.10

---

## R0. What this document is (and isn't)

The base spec (`dishision-spec.md`) defines **what Dishision is** — data model, units, recommendation engine, sharing, the theme *architecture*, and the behaviour of every screen. All of that stands unchanged.

This document defines **how Dishision looks and feels**. It exists because the first build, while functionally complete, reads as a prototype: flat cards, no depth, no focal point, emoji-in-a-grey-box, no motion. The goal is a **polished, "designed" app** — not new features.

**Precedence rules:**

- **Behaviour, data, and the token *architecture* (base §4.1–4.4) are law and unchanged.** Nothing here adds a hex literal to a component, invents per-theme optional tokens, or breaks the "every theme defines every token" contract (base §15).
- Where this document and the base spec disagree on **visual treatment or layout** (e.g. base §4.8 "emoji tile", base §5.2 Home layout), **this document wins**, and the base spec now points here (base §4, §5, §17).
- Where they disagree on **anything else**, the base spec wins.

**The design language, in one line:** *cosy warmth with editorial confidence* — Hearth's warm ground and rounded, softly-shadowed cards (the "Warm & Cozy" direction), lifted by one editorial move per screen: a big serif headline and a full-bleed, photo-led hero (the "Editorial" direction). Approved by the client as the blend of directions A + B from the exploration mockups.

---

## R1. Principles

1. **Every screen opens with a moment, not a list.** A serif headline, a full-bleed photo hero, or a bold identity block — something with weight sits above the fold. Content lists come *after* the moment.
2. **Warm, not flat.** Cards float on soft, warm-tinted shadows (R2.1). Nothing is a bare `View` with a 1px border any more. Depth is the single biggest lever between "prototype" and "product".
3. **Photo-forward, with a designed fallback.** Real food photography leads wherever we have it; where we don't, a **category-tinted gradient tile** stands in — deliberate, never a grey box (R4).
4. **Wrap, never scroll sideways.** *No horizontal scrolling anywhere in the app.* Rows of cards, chips, or recommendations **wrap** onto the next line. This is a hard rule (R7) and a direct client instruction.
5. **Spend boldness once per screen.** One editorial focal point; everything around it stays quiet. Two heroes is no hero.
6. **Type carries the personality.** Fraunces (serif) does the emotional work at large sizes; Public Sans stays out of the way; IBM Plex Mono makes numbers feel precise (R3).
7. **Themeable to the core.** Every new visual value — shadow, gradient, glow, scrim — derives from the active theme's existing tokens, computed in one place (R2). The redesign looks intentional in all 17 themes, light and dark, with zero per-component colour.
8. **Motion is a seasoning.** Gradients and haptics only for now (client scope). No animation library yet; micro-feedback over choreography (R3).

---

## R2. The derived visual layer

The base spec's `ColourTokens` contract (base §4.2) stays **exactly as-is** — no new hand-authored per-theme slots, so no theme table grows and the 17-theme maintenance burden is unchanged. Instead, the new visual values are a **derived layer**: a single pure function computes them from the active theme once, inside `ThemeContext`, and exposes them on the theme object. Components read `theme.elevation.card`, `theme.gradients.accent`, etc. — **still no hex literals in components** (base §15).

```ts
// src/theme/deriveVisuals.ts — pure, tested, called once in ThemeContext
export function deriveVisuals(c: ColourTokens, mode: ThemeMode): VisualTokens
```

This is the architecturally honest way to add depth to a token system that forbids per-component colour: derivation is centralised, deterministic, and snapshot-tested across every theme (R9, testing).

### R2.1 Elevation (shadows)

Three levels. Shadows are **warm on light themes, neutral on dark** — a pure-grey shadow on Hearth's sand looks dirty; a shadow tinted from `--ink` reads as warm and intentional.

```
shadowColor = mode === 'dark' ? rgba(0,0,0)            // neutral on dark grounds
                              : rgba(ink @ warm)        // ink is a warm near-black → warm shadow

           offsetY   blur   spread   opacity(light)   opacity(dark)
  e1 rest     6       16      -8         0.10             0.22        cards at rest
  e2 raised  14       28     -16         0.14             0.28        hero cards, plan cover
  e3 float   22       40     -18         0.16             0.30        modals, floating CTAs
```

RN mapping: iOS uses `shadowColor/shadowOffset/shadowRadius/shadowOpacity`; Android uses `elevation` (approximate the level: e1→3, e2→8, e3→14). A `<Card level={1|2|3}>` component owns this so no screen hand-writes shadow props.

### R2.2 Gradients

Consumed via `expo-linear-gradient` (R3). Each gradient is `{ colors: string[], start, end }` derived from theme tokens:

```
accent      [ accent, mix(accent, black 14%) ]     135°   primary CTAs ("Start cooking", "Eat", "Save")
accentSoft  [ accentTint, mix(accentTint, surface 40%) ] 160°  selected chips, subtle fills
warmHero    [ bg, surfaceWarm, mix(amberTint, bg 50%) ] 165°  Home hero ground behind the glow (R6.1)
```

Buttons keep a legible **`accentFg`** label over the accent gradient in every theme (the token already guarantees contrast, base §4.2).

### R2.3 Glow

The Home hero's soft light (R6.1). Two blurred, absolutely-positioned radial blobs — hand-rolled, exactly as Memento does it, no gradient asset:

```
glowWarm = radial( amber  @ 0.34 → 0 )   // top-right, ~200px
glowCool = radial( accent @ 0.24 → 0 )   // top-left,  ~150px
```

On dark themes the same derivation gives a subtle luminous haze rather than a wash; alpha is unchanged because dark grounds swallow it naturally.

### R2.4 Photo scrim & on-photo ink

Text, badges, and back buttons sit over photographs in every theme, so their colours are **not** themed — they must read on *any* image. These are the one sanctioned place for fixed near-white/near-black values, and they live as tokens (`theme.onPhoto.*`) so components still never write a literal:

```
photoScrim   linear( to top, rgba(24,14,8,0.72) → transparent @ 55% )   // legibility gradient over photos
onPhoto      rgba(255,255,255,0.98)     // titles/badges on a photo
onPhotoDim   rgba(255,255,255,0.72)     // metadata on a photo
photoChipBg  rgba(255,246,240,0.92)     // floating pill/back-button ground on a photo
```

### R2.5 Radius additions

The base scale (base §4.6: chip 6 / tile 10 / card 13 / pill 20) gains two softer values for the new photo surfaces. Additive, not a replacement:

```
photo  16   photo cards, list/grid recipe tiles, fallback tiles
hero   24   plan cover, detail hero, large floating cards
```

Existing components keep their current radii; only the redesigned photo surfaces use the new ones.

### R2.6 Type additions

Faces and the base scale (base §4.5–4.6) are unchanged. One display size is added for editorial headlines, and two usage rules are pinned:

```
Scale += hero 30   // Home greeting, cover title, screen-title serif moments (base scale already has 24/32)
```

- **Serif headlines** (Fraunces 700) get `letter-spacing: -0.4px` and `line-height: 1.08` at `hero`/`xxl` sizes — tight, confident, editorial.
- **Eyebrows / section labels** (Public Sans 700 or Mono) get `letter-spacing: 0.13em`, `text-transform: uppercase`, colour `--ink-3`. One consistent `<SectionLabel>` everywhere (R5).

---

## R3. Motion & tactility

**New dependencies (added to base §15.1):**

```
expo-linear-gradient   gradients (R2.2), photo scrims (R2.4), hero glow blending
expo-haptics           tactile feedback on key actions
```

No animation library (`react-native-reanimated`, Moti, Lottie) in this phase — deliberately scoped out by the client. Motion is limited to:

- **Native `Pressable` press states** — every tappable surface scales to ~0.98 and/or lifts its shadow on press (built-in, no lib).
- **Haptics** — `expo-haptics` on: **Start cooking** (medium impact), **Eat / Bin** a leftover (light), **Save log / rate stars** (selection), **Apply theme** (light), completing a cook (success notification). Never on scroll or passive navigation — haptics are for committing an action.
- **`LayoutAnimation.easeInEaseOut`** (built-in) for expand/collapse (filters, meal sections) — cheap, no dependency.

**Reduced motion:** honour the OS "reduce motion" setting — skip press-scale and layout animation, keep haptics (they're an accessibility aid, not motion).

A later phase may introduce Reanimated for the editorial page-load reveal and shared-element photo transitions; the components below are structured so that upgrade is additive.

---

## R4. Photography & the fallback tile

Real photos are **already supported** — `recipe.photo_uri` exists in the schema (base §2.3, migration 001) and flows through `EnrichedRecipe.photoUri`. The redesign simply makes photos *lead* instead of hide. No migration required.

**The `<RecipePhoto>` component** (supersedes `EmojiTile` for recipe surfaces) resolves in this order:

1. **`photo_uri` present** → render the image, `resizeMode: cover`, at the surface's radius (`photo` or `hero`), with the R2.4 scrim when text/badges overlay it.
2. **`photo_uri` null** → render the **category-tinted gradient fallback tile**: a soft gradient derived from the recipe's primary-protein category colour (base §4.4) over `--surface-warm`, with the dish `photo_emoji` centred and large. Warm, deliberate, and *themed* — it changes with the palette.

```ts
fallbackGradient(categoryColor, surfaceWarm) =
  [ mix(categoryColor, surfaceWarm 78%), mix(categoryColor, surfaceWarm 55%) ]  // 150°
```

This replaces base §4.8's flat `--surface-warm` emoji tile everywhere a recipe is shown at card/hero size (Home, Recipes, Detail, Cook log, Profile favourites, Plan day sheet). Small inline emoji (e.g. a 36px leftovers row) may keep the simple tile — the gradient is for surfaces ≥ ~88px.

**Sourcing real photos** is out of scope for this redesign (it's a content task, per base §8 pipeline and §9.1's "post-v1" note). The fallback makes the app look finished *today*, with every real photo added later a pure upgrade. A future slice adds a photo picker to the recipe form via the existing `expo-image-picker` + `expo-image-manipulator` pipeline (base §8).

---

## R5. Component additions

A small set of reusable pieces. Each reads only from `useTheme()`.

| Component | Role |
| --- | --- |
| `<Card level={1\|2\|3}>` | The universal surface: `--surface` fill, `hero`/`photo`/`card` radius, R2.1 shadow. Replaces ad-hoc `View + border` cards. Retires the flat 1px-border card. |
| `<RecipePhoto recipe size scrim?>` | Photo-or-fallback resolver (R4). The single way a recipe's image is drawn. |
| `<HeroCover>` | Full-bleed photo + R2.4 scrim + overlaid title/badge/CTA. The editorial move on Home (plan) and Detail. |
| `<GlowField>` | The two absolutely-positioned R2.3 blobs behind a hero's content. Home only. |
| `<SectionLabel>` | The one uppercase eyebrow (R2.6). Replaces every hand-styled `sectionHeader`/`seclabel`/`lbl`. |
| `<PillButton variant>` | `accent` (gradient, R2.2), `soft` (accentTint), `ghost` (bordered). Fires the R3 haptic for its action. |
| `<TimeSplitBar>` | Unchanged from base §4.7 — already the signature element; simply appears inside the new cards. |
| `<MacroTiles>` | The four-up kcal/protein/carbs/fat row on Detail, each a `--surface-warm` tile (evolves existing `MacroBox`). |
| `<Sheet>` | The universal modal/bottom-sheet ground (R6.16): `--surface` fill, `hero` radius on the top corners only, e3 shadow, grabber handle, dimmed backdrop, safe-area bottom padding. Every modal in the app mounts inside one. |
| `<ScreenHeader title back? action?>` | The standard sub-screen top bar: back chevron, Fraunces title, optional trailing action. Used by every screen that is *not* a tab root. |
| `<ListRow>` | The settings/detail row: label, optional value, optional chevron or control, hairline separator. The building block of the chrome-tier screens (R6.11–R6.13). |
| `<EmptyState>` | Centred illustration glyph in a `surfaceWarm` circle, Fraunces line, `ink-2` explanation, optional `<PillButton>`. One component, one look, every screen (R6.16). |

**Removed pattern:** the flat `{ backgroundColor: surface, borderRadius: 13, borderWidth: 1, borderColor: border }` card. Migrate every occurrence to `<Card>`.

---

## R6. Screen redesigns

Each screen keeps its exact behaviour, state machine, and data flow from the base spec. Only structure and styling change. `[photo]` denotes a `<RecipePhoto>` (real image or fallback tile).

**Coverage is total.** R1.0 of this document redesigned six screens; the app has roughly forty-five distinct surfaces. R1.1 completes the audit — every screen, sheet, and modal in the codebase is assigned to exactly one of three tiers below, and nothing is left unassigned. A surface that ships without a tier is a spec bug.

#### Tiers

| Tier | Gets | Screens |
| --- | --- | --- |
| **Editorial** | The full language: one hero/headline moment, photo-led cards, `<GlowField>` where specified. | Home, Recipes, Recipe detail, Plan, Cook log, Profile (R6.1–R6.6) |
| **Chrome** | `<Card>` + R2.1 elevation, `<SectionLabel>`, `<ScreenHeader>`, `<PillButton>`, `<ListRow>`, wrapping rows, `<EmptyState>` — **no** serif hero, **no** photo hero, **no** glow. | Everything in R6.8–R6.15 |
| **Exempt** | Named, deliberate exclusions. Each states *why*. | Cooking Mode (R6.8.1), PhotoViewer (R6.16.4) |

The Chrome tier exists because R1.5 ("spend boldness once per screen") scales to the app, not just the screen: if Pantry and Settings shout as loudly as Home, Home stops being the moment. Chrome screens are calm, consistent, and unmistakably the same app — they simply don't compete.

### R6.1 Home (base §5.2)

The signature screen. Cosy hero + one editorial cover.

```
┌───────────────────────────────┐
│  ╲  soft warm glow (R2.3)   ╱ │
│   MONDAY · 20 JULY             │  ← mono eyebrow, ink-3
│   What are we                  │  ← Fraunces 30, ink; "tonight?" in
│   making tonight?              │     accent italic. The cosy moment.
│                                │
│  TONIGHT'S PLAN · DINNER       │  ← SectionLabel
│  ┌───────────────────────────┐ │
│  │        [ photo hero ]     │ │  ← HeroCover: full-bleed photo,
│  │  ● PLANNED · DINNER       │ │     scrim, floating badge. Editorial.
│  │                           │ │
│  │  Miso-glazed salmon       │ │  ← Fraunces over/under photo
│  │  ▓▓▓▓░░░░  10m · 15m       │ │  ← TimeSplitBar
│  │  [   Start cooking →   ]  │ │  ← PillButton accent (gradient+haptic)
│  └───────────────────────────┘ │
│                                │
│  LEFTOVERS . X Servings        │
│  ┌──────────────────────────┐  │  ← leftovers: warm rows, tinted
│  │ 🍛  2 of Katsu curry  Eat│  │     emoji tile, Eat/Bin pills
│  └──────────────────────────┘  │
│                                │
│  OR TRY SOMETHING ELSE         │
│  ┌────────────┐ ┌────────────┐ │  ← recommendations WRAP into a
│  │  [photo]   │ │  [photo]   │ │     2-up grid — NO horizontal
│  │ Harissa …  │ │ Cacio e …  │ │     scroll (R7). Dominant pick is
│  │ ★4.6·1h10m │ │ ★4.4·15m   │ │     the first, full-width, larger
│  └────────────┘ └────────────┘ │     card; the rest wrap 2-up beneath.
│                                │
│  I'M FEELING…                  │
│  [Quick][Healthy][Comfort]     │  ← wrapping accent-tint chips
│  [High protein][Cheap][Have]   │
└───────────────────────────────┘
```

- **Hero:** `<GlowField>` behind a mono eyebrow (`WEEKDAY · DD MONTH`) and the Fraunces greeting, with the last word in `accent` italic. Ground is the `warmHero` gradient (R2.2). Rotating greeting copy is fine ("What are we making tonight?", "Evening, {name}", "Hungry?") — keep it warm and short.
- **Plan** → `<HeroCover>`: the editorial centrepiece. Photo fills the card top, `PLANNED · SLOT` badge floats on it (`photoChipBg`), name + `TimeSplitBar` + accent CTA below on `--surface`. `<Card level={2}>`.
- **Leftovers:** `<Card>` warm rows (`--surface-warm`), tinted emoji tile, **Eat** (soft pill) / **Bin** (ghost). Unchanged behaviour (base §5.2, §5.7).
- **Recommendations:** dominant pick = one full-width `<Card level={1}>` with a larger `[photo]`; remaining picks **wrap** into a two-column grid below. The old side-scroll idea from the exploration mockups is explicitly rejected per client (R7).
- **"I'm feeling…":** wrapping row of `accentSoft` chips → opens the picker (base §5.3), unchanged.

### R6.2 Recipes (base §5.4)

```
Recipes                    + Add
🔍  Search recipes, ingredients…      ← surface-warm pill
[Quick][Healthy][Comfort][High…]      ← filter chips WRAP (no scroll)
24 matches                Sort ▾  ⊞ ☰
🍽 DINNER · 12
┌───────────┐ ┌───────────┐
│  [photo] ♥ │ │  [photo]   │           ← 2-up photo grid, heart overlay
│ Harissa …  │ │ Miso salmon│           ← Fraunces name
│ ★4.6·1h10m │ │ ★4.7·25m   │           ← mono meta
└───────────┘ └───────────┘
🥗 LUNCH · 6      …
```

- Photo-led `<Card>` grid (2-up, wraps). Favourite heart floats top-right on the photo (`photoChipBg`).
- Search, sort, layout toggle, meal-type `<MealSection>`s, pagination, exclusions — **all behaviour unchanged** (base §5.4). Filter chips and every chip row **wrap**; the layout toggle still offers list vs grid, and list rows also gain the photo thumbnail + soft shadow.
- Keep the note-match labelling and log-note search from base §5.4 verbatim.

### R6.3 Recipe detail (base §5.5)

```
┌───────────────────────────────┐
│  ←            [ photo hero ] ♥ │  ← HeroCover, full-bleed, back +
│               (scrim)          │     favourite float on the photo
├───────────────────────────────┤
│  Slow-roast harissa chicken    │  ← Fraunces
│  Sticky, spiced, hands-off.    │  ← ink-2 description
│  [★4.6][Dinner][High protein]  │  ← wrapping meta chips
│  ▓▓▓░░░░░  20m active·50m oven │  ← TimeSplitBar
│  ┌────┐┌────┐┌────┐┌────┐      │  ← MacroTiles
│  │540 ││42g ││18g ││28g │      │
│  │kcal││prot││carb││fat │      │
│  INGREDIENTS · 4 servings  ⊟⊞  │  ← SectionLabel + servings stepper
│  ✓ Chicken thighs       800 g  │  ← pantry check (green ✓ / muted)
│  ✓ Harissa paste        3 tbsp │
│  METHOD                        │
│  ①  Toss chicken with harissa… │  ← numbered steps, accent-tint index
│  [      Start cooking →      ] │  ← PillButton accent (haptic)
│  I already cooked this         │  ← ghost link
└───────────────────────────────┘
```

- The emoji header block (base §5.5) becomes a full-bleed `<HeroCover>`. Everything below is behaviour-identical: servings stepper + live scaling (base §3.4), pantry dots→checks, macro provenance line, the `⚠ from N of M` note, cost-per-serving, prep/cook step counts, Start cooking / "I already cooked this" (base §5.5, §5.6, §5.7).
- This screen remains the **theme-picker preview** (base §4.10) — the redesigned version is what the picker now previews, which only makes the picker look better.

### R6.4 Plan (base §5.8)

Calendar behaviour is unchanged (cooked-dots layer, month nav, jump-to-today, day sheet). Styling only:

- Rounded calendar cells; **today** = `accentTint` fill, `accentText` number (not a hard box).
- Cook dots stay category-coloured (base §4.4) but sit in a fixed-height row so the grid never jumps.
- Add a small **protein legend** under the grid (dot + label) so the colours *mean* something to a first-time viewer.
- Day sheet rows use `<RecipePhoto size=36>` + name + category dot; tap → Cook log (unchanged).

### R6.5 Cook log (base §5.9)

```
Cook Log                  Select
🔍  Search logs, notes…
18 cooks logged     Sort ▾  ⊞ ☰
┌───────────┐ ┌───────────┐
│  [photo]   │ │  [photo]   │        ← history as a photo grid (wraps)
│ Harissa …  │ │ Miso salmon│
│ 18 Jul     │ │ 16 Jul     │
│ ★★★★★      │ │ ★★★★☆      │
│ would repeat│ │ perfect    │        ← quick-tag pill
└───────────┘ └───────────┘
```

- Grid/list, search, filters (stars, tags, date range), pagination, multi-select delete, the log editor (stars, quick-tags, free-text, **photos**, substitutions + promote-to-recipe) — **all unchanged** (base §5.9). A log's own photos surface on its card once added.
- Cards become `<Card>` with `<RecipePhoto>`, star row, and a quick-tag pill. Filters and tag rows **wrap**.

### R6.6 Profile / "Me" (base §5.10)

- **Identity block:** rounded `hero`-radius avatar tile with a soft gradient ground (from `amberTint`→`surfaceWarm`), the reroll die as a floating badge, name in Fraunces with an inline edit affordance. Behaviour unchanged (edit name, reroll emoji, photo avatar wins if set).
- **Favourites:** `<Card>` with `<RecipePhoto size=40>` thumbs; "View all" → Recipes filtered to favourites (unchanged, base §5.10).
- **Theme card:** unchanged behaviour → opens the two-step picker (base §4.10); restyled as a `<Card>` with the live mini time-split bar.
- **Settings** rows (currency, debug, backup as they land) become `<Card>` rows.

### R6.7 Coverage map

Every surface in the codebase, its tier, and its rule. Paths are relative to `src/`.

| Surface | File | Tier | Rule |
| --- | --- | --- | --- |
| Home | `screens/HomeScreen` | Editorial | R6.1 |
| Recipes | `screens/RecipesScreen` | Editorial | R6.2 |
| Recipe detail | `recipes/RecipeDetailScreen` | Editorial | R6.3 |
| Plan | `screens/PlanScreen` | Editorial | R6.4 |
| Cook log | `screens/CookLogScreen` | Editorial | R6.5 |
| Profile | `screens/ProfileScreen` | Editorial | R6.6 |
| Cooking Mode | `recipes/CookingModeScreen` | Exempt | R6.8.1 |
| Cook complete | `recipes/CookCompleteScreen` | Chrome | R6.8.2 |
| "I'm feeling…" | `recommend/FeelingPickerSheet` | Chrome | R6.8.3 |
| Recipe form | `recipes/RecipeFormScreen` | Chrome | R6.9.1 |
| Emoji picker | `recipes/EmojiPicker` | Chrome | R6.9.2 |
| Exclusions | `recipes/ExclusionsScreen` | Chrome | R6.9.3 |
| Shopping list | `plan/ShoppingListScreen` | Chrome | R6.10.1 |
| Pantry | `plan/PantryScreen` | Chrome | R6.10.2 |
| Ingredients admin | `recipes/IngredientsScreen` | Chrome | R6.10.3 |
| Ingredient prices | `recipes/IngredientPriceSheet` | Chrome | R6.10.4 |
| Settings | `profile/SettingsScreen` | Chrome | R6.11.1 |
| Stats | `profile/StatsScreen` | Chrome | R6.11.2 |
| Cost refresh | `profile/CostRefreshScreen` | Chrome | R6.11.3 |
| Backup | `backup/BackupScreen` | Chrome | R6.11.4 |
| Avatar sheet | `profile/AvatarSheet` | Chrome | R6.11.5 |
| Favourite picker | `profile/FavouritePickerModal` | Chrome | R6.11.5 |
| Household | `household/HouseholdScreen` | Chrome | R6.12.1 |
| Pairing | `household/PairingScreen` | Chrome | R6.12.2 |
| Member profile | `household/MemberProfileScreen` | Chrome | R6.12.3 |
| Member recipes | `household/MemberRecipesScreen` | Chrome | R6.12.4 |
| Member recipe detail | `household/MemberRecipeDetailScreen` | Chrome | R6.12.4 |
| Manage visibility | `household/ManageVisibilityScreen` | Chrome | R6.12.5 |
| Sync log | `household/SyncLogScreen` | Chrome | R6.12.6 |
| Rating breakdown | `household/RatingBreakdownSheet` | Chrome | R6.12.7 |
| Share sheet | `sharing/ShareSheetScreen` | Chrome | R6.13.1 |
| Import entry | `sharing/ImportEntryScreen` | Chrome | R6.13.2 |
| Import preview | `sharing/ImportPreviewScreen` | Chrome | R6.13.3 |
| Recipe diff | `sharing/RecipeDiffView` | Chrome | R6.13.3 |
| Manual merge | `sharing/ManualMergeScreen` | Chrome | R6.13.4 |
| QR scanner | `sharing/QrScannerScreen` | Chrome | R6.13.5 |
| Theme picker | `theme/ThemePickerScreen` | Chrome | R6.14 |
| Debug + JSON viewer | `debug/DebugScreen`, `debug/JsonViewer` | Chrome | R6.15 |
| Tab bar | `navigation/TabShell` | Chrome | R6.16.1 |
| Shared modals (9) | `components/*`, `plan/PantryUnitPickerModal`, `recipes/SortMenu` | Chrome | R6.16.2 |
| Loading / error | `App.tsx` | Chrome | R6.16.3 |
| PhotoViewer | `photos/PhotoViewer` | Exempt | R6.16.4 |

### R6.8 Cook flow

#### R6.8.1 Cooking Mode — **exempt** (base §5.6)

**Why exempt:** base §1.1 — *"cooking is a hostile environment. Wet hands, bad light, glanced at from three feet."* Every element of the editorial language works against that. A photo hero steals space from the 44px instruction line; a scrim reduces contrast; soft shadows are invisible at arm's length. This screen is optimised for legibility, and legibility wins.

**What it does adopt** — the minimum that keeps it recognisably the same app:

- The step card and the all-steps (☰) sheet take R2.1 elevation (`e2` / `e3`) so they read as surfaces rather than regions.
- The control row buttons and **Complete** become `<PillButton>`, with the base spec's existing haptics.
- The ☰ sheet mounts inside `<Sheet>` (R6.16.2), which also satisfies base §5.6's "centred and scrollable within its own bounds" layout note.

**What it must not adopt:** no `<HeroCover>`, no `<GlowField>`, no `<RecipePhoto>`, no radius changes, no type-scale changes. The 44px instruction line, the drift warning, the progress bar, and the safe-area bottom padding (base §1.3, §5.6) are untouched.

**Two functional additions land here in the same slice** (base §5.6, v1.7). They are behaviour, not polish, and exemption does not excuse them from looking deliberate:

- **Ready state.** The clock no longer starts on entry. **Start cooking** is a full-width `<PillButton variant="accent">` firing the existing medium-impact haptic — the same button, in the same place, as the one on Recipe detail that got you here, so the gesture repeats rather than surprises. The overall clock sits at `0:00` in `ink-3` until it runs; a running clock is `ink`. That contrast is the whole affordance, so do not tint the resting clock any lighter than `ink-3` — glanced at from three feet it still has to read.
- **Lane tabs.** A single row of tabs directly beneath the overall clock, only when the timeline has ≥2 lanes (base §5.6). Each tab is a `pill`-radius target of at least 44px: lane name in `body.semiBold`, lane timer in mono `sm` beneath, and a leading state glyph (`●` running · `⚠` overdue · `✓` done · `○` waiting). The active tab is `accentTint` with `accentText`; inactive tabs are `chipBg` with `ink-2`; the overdue tab's glyph and timer are `amberText`. **The glyph is mandatory** — R7's colour-is-never-the-only-signal rule bites hardest here, on the screen read at arm's length in bad light.
  - Tabs **wrap** to a second line rather than scrolling (R7). Beyond four lanes they will; that is fine, and it is still the correct behaviour.
  - The tab strip is chrome, not an editorial band: no gradient, no shadow, no serif.
  - An auto-switch (base §5.6) is a view change and fires **no haptic of its own** — R7's "haptics commit, never narrate". The alert that caused the switch already has one.
  - **Back to live** (the relabelled "Go to current step") stays the existing `accentTint` pill, and is the only visual cue that the view is pinned.
- The ☰ sheet groups its steps by lane under `<SectionLabel>`s, carrying the same state glyphs. No other change to it.

#### R6.8.2 Cook complete (base §5.7)

Chrome tier, with one concession to occasion — this is a small celebration, and it should feel like one:

- Title block: `<SectionLabel>` "COOKED" + the recipe name in Fraunces `xl` + the mono `32 min · 7th time` line. No photo hero; the cook just spent twenty minutes looking at this dish.
- Each of the four blocks (servings, leftovers, pantry usage, rating) becomes its own `<Card level={1}>` with a `<SectionLabel>`, separated by `spacing.lg` — this screen is exactly the "more than two row-types stacked" case base §4.6 warns about.
- The shortfall line (`⚠ ran short`) uses `amberText`; the `→ added to shopping list` follow-up uses `ink-3`.
- Star row is large-target (44px), fires the R3 selection haptic; **Done** is a `<PillButton variant="accent">` firing the success notification haptic.

#### R6.8.3 "I'm feeling…" picker (base §5.3)

Mounts in `<Sheet>`. Chips wrap (they already do). Selected chips use the `accentSoft` gradient; disabled chips (under-populated data) drop to `chip-bg` with the reason in `ink-3` beneath — the reason must stay visible, per base §5.3. The live match count sits in mono above the CTA.

### R6.9 Recipe authoring

#### R6.9.1 Recipe form (add / edit)

The densest screen in the app, and the one base §4.6's "breathing room" rule was written for. Chrome tier:

- `<ScreenHeader>` with **Save** as the trailing action.
- Each form section (Basics, Ingredients, Steps & lanes, Tags, Photo) is a `<Card level={1}>` under a `<SectionLabel>`, `spacing.lg` apart.
- **Section control** (base §5.4.1, new in v1.7): the first `<ListRow>` in Basics — label "Section", current meal type as the value, chevron. Tapping opens a four-option single-select in a `<Sheet>` (R6.16.2), the selected row carrying a check and an `accentSoft` fill. A `<Sheet>` rather than an inline chip row because it is single-select and mutually exclusive: chips beside the free-text tag chips below would read as another multi-select, which is exactly the confusion this control exists to remove. The meal tags no longer appear among the tag chips.
- Text inputs sit on `bg` inside `surface` cards — never `surfaceWarm` for both card and field, per base §4.6.
- Ingredient and step rows are `<ListRow>`s with a drag handle and a destructive trailing action in `red`.
- Keyboard avoidance is unchanged — standard `KeyboardAvoidingView`, do not touch it.

#### R6.9.2 Emoji picker

**Fixes an R7 violation:** `recipes/EmojiPicker.tsx:32` is a `horizontal` ScrollView. It becomes a wrapping grid inside a `<Sheet>`.

#### R6.9.3 Exclusions (base §5.4)

Two `<SectionLabel>` groups (Never again / Not tonight) of `<ListRow>`s inside `<Card>`s. Expiring rows show their remaining days in mono `ink-3`. `<EmptyState>` when both are empty — the healthy case, so the copy is positive, not apologetic.

### R6.10 Plan siblings

#### R6.10.1 Shopping list (base §5.8)

- `<ScreenHeader>` + a mono progress line (`12 of 18 checked`) with a slim `accent` progress bar under it. This is the screen's one accent moment.
- Sections become `<Card>`s; each line is a `<ListRow>` with a 28px checkbox target.
- Checked rows: `ink-3`, strikethrough, `surfaceWarm` fill — visibly settled, not deleted.
- The pack-rounding dual line (base §3.5, *"1 bag (200 g) — recipes need 140 g"*) keeps the purchase quantity in mono `ink` and the needed quantity in `ink-3` beneath. This distinction is load-bearing; do not compress it to one line.
- Drag reordering (`DraggableShoppingSection`) is preserved exactly; the dragged row lifts to `e3`.

#### R6.10.2 Pantry (base §5.8)

`<ListRow>`s grouped in `<Card>`s by ingredient category, using the base §4.4 category colours as a leading dot — the same colour language as the Plan calendar, so the two screens teach each other. Quantities in mono, right-aligned so they form a column (base §4.5 rationale). `<EmptyState>` on a fresh install.

#### R6.10.3 Ingredients admin

`<ScreenHeader>` + search field styled as the R6.2 `surfaceWarm` pill. Results are `<ListRow>`s inside a `<Card>`; each shows name, base unit, and a `cost/100` in mono, with `ink-4` for missing data — degrade honestly (base §1.1), never a zero.

#### R6.10.4 Ingredient price sheet

**Fixes an R7 violation:** `recipes/IngredientPriceSheet.tsx:139` is a `horizontal` ScrollView. The unit selector becomes a wrapping chip row inside a `<Sheet>`. Price points list as `<ListRow>`s; the derived `cost_per_100` is called out in a `surfaceWarm` tile so it reads as computed, not entered.

### R6.11 The Me subtree

#### R6.11.1 Settings (base §5.10)

The reference implementation of the Chrome tier. `<ScreenHeader>`, then `<Card>` groups under `<SectionLabel>`s — Appearance, Recommendations, Cooking, Shopping, Data, Advanced — each a stack of `<ListRow>`s with a native `Switch`, a value + chevron, or a slider. The weight sliders keep their live mono value readouts. No hero, no headline beyond the header.

#### R6.11.2 Stats (base §5.10)

The one Chrome screen with real visual interest, because the data earns it:

- Four `<SectionLabel>` groups (Counts, Trends, Nutrition, Money) matching base §5.10.
- Headline numbers in Fraunces `xxl` with a mono caption beneath — the "cooked 18 of the last 30 days" line is the screen's focal number.
- The existing ranked bars (`StatsScreen.tsx:93`) keep their category colours (base §4.4) and gain the `accentSoft` gradient fill.
- Bars wrap; nothing scrolls sideways.

#### R6.11.3 Cost refresh (base §6.9)

A `<Card>` per stale ingredient, showing the age of the price in `amberText`, with an inline field and a `<PillButton variant="soft">` per row. `<EmptyState>` when nothing is stale.

#### R6.11.4 Backup (base §10)

Chrome, deliberately sober. Actions as `<PillButton>`s: Export (`soft`), Restore (`ghost`), and the destructive wipe in `red` behind the existing confirm. The last-auto-backup timestamp sits in mono `ink-3`. No celebration styling on a data-loss surface.

#### R6.11.5 Avatar sheet & Favourite picker

Both mount in `<Sheet>`. The avatar sheet's emoji pool wraps into a grid; the re-roll die is a `<PillButton variant="ghost">`. The favourite picker's rows use `<RecipePhoto size={40}>`, matching R6.6's favourites list.

### R6.12 Household

#### R6.12.1 Household (base §5.11)

Member rows become `<Card level={1}>` with the avatar in a `hero`-radius tile, name in Fraunces `md`, and `synced 2 days ago · 12 public recipes` in mono `ink-3`. A sync older than 60 days shows in `amberText` (base §7.6 staleness). **+ Add person** is a `<PillButton variant="soft">`. The visibility footer is its own `<Card>` with the honest count line and a `ghost` **Manage visibility**.

#### R6.12.2 Pairing (base §5.11, §7.5)

The QR sits in a white `photo`-radius tile on a `<Card level={2}>` — **the QR quiet zone stays pure white in every theme**, dark themes included, or scanners fail. This is a functional exception, and it lives in `theme.onPhoto` alongside the other fixed values (R2.4) rather than as a component literal. Address + 6-digit code below in mono `xl`, wide-tracked, tappable to copy. Connection state (waiting / connected / failed) is a single `<Card>` row with a coloured leading dot: `ink-3` / `green` / `red`.

#### R6.12.3 Member profile (base §5.12)

Mirrors R6.6's identity block — the same avatar tile and gradient ground — but with `synced N days ago` in place of the edit affordance, since nothing here is editable. Their favourites use `<RecipePhoto size={40}>`. The three actions stack as `<PillButton>`s: **Sync now** (`accent`), **Send my ratings** (`soft`), **Remove from household** (`ghost`, `red` label).

#### R6.12.4 Member recipes & member recipe detail (base §5.12)

**These reuse the Recipes tab components with the cache as their data source** — base §15 makes that a hard rule, so they inherit R6.2 and R6.3 automatically and must not be styled separately. The only additions are a persistent `photoChipBg` **read-only** badge and an **Import** `<PillButton>` per row. If the redesign of these screens requires touching anything other than the data source and those two elements, the shared component has been broken.

#### R6.12.5 Manage visibility (base §2.4)

`<ListRow>`s with a `<RecipePhoto size={36}>`, name, and a `Switch`. A `<SectionLabel>` header carries the running public count. The "private by default" explainer sits in a `surfaceWarm` `<Card>` at the top — it's reassurance, not a warning, so it uses `ink-2`, never `amber`.

#### R6.12.6 Sync log (base §7.5)

Chronological `<ListRow>`s inside a `<Card>` per day. Direction is a leading glyph (`↑` sent / `↓` received) in `accentText` / `green`; kind and item count in mono. Dense by intent — this is a diagnostic surface.

#### R6.12.7 Rating breakdown (base §7.6)

Mounts in `<Sheet>`. My rating is the focal element: a large star row on a `surfaceWarm` tile. Household ratings list beneath as `<ListRow>`s with avatar, stars, and a mandatory `synced_at` label in `ink-3` — base §15's *"a snapshot must never be dressed as live data"* is a hard rule, and the date must never be styled away. The household average sits in a bordered footer row with the no-self-rating fallback copy intact (base §2.5).

### R6.13 Sharing & import

#### R6.13.1 Share sheet (base §7.1–7.2)

A `<Card level={2}>` showing the recipe being shared via `<RecipePhoto>` + name, then the transport options (QR / file / link) as `<PillButton>`s. The QR follows R6.12.2's white-quiet-zone rule. The size-threshold fallback message (base §7.2, 1.2 KB) shows in `ink-2`, not as an error.

#### R6.13.2 Import entry (base §7.3)

Three `<Card>` entry points (scan / open file / paste), each with a glyph in a `surfaceWarm` circle, a Fraunces label, and an `ink-2` line. `<EmptyState>` styling in spirit, but these are actions, not an absence.

#### R6.13.3 Import preview & recipe diff (base §7.3)

The rule from base §15 — *"nothing writes on import without a preview"* — makes this screen's legibility functional, not cosmetic:

- The incoming recipe renders in a `<Card level={2}>` using the R6.3 detail composition at reduced scale, so what you approve looks like what you'll get.
- Diff rows: added in `green`, removed in `red` with strikethrough, changed showing old (`ink-3`, struck) above new (`ink`). Colour is never the only signal — every row also carries a `+` / `−` / `~` glyph, for colour-blind users and for the themes where `green` and `accent` are the same token (Seaglass, Midnight Kitchen).
- **Import** is a `<PillButton variant="accent">`; **Cancel** is `ghost`. The destructive-overwrite path keeps its existing confirm.

#### R6.13.4 Manual merge (base §7.3)

Two-column field comparison (mine / theirs) as `<Card>` pairs, the selected side carrying an `accent` border and an `accentSoft` fill. Columns stack vertically on narrow viewports rather than scrolling sideways (R7).

#### R6.13.5 QR scanner

Full-bleed camera with a `photoScrim` (R2.4) top and bottom, a `photo`-radius cutout frame in `onPhoto`, and instruction copy in `onPhotoDim`. Back button uses `photoChipBg`. The camera-permission-denied state uses `<EmptyState>` with a settings deep-link.

### R6.14 Theme picker (base §4.10)

Chrome tier, and a special case: **it must look correct in the theme being previewed, not the theme in force.**

- **Step 1 (grid):** each theme card becomes a `<Card level={1}>` rendered in *its own* palette — its `bg`, its `surface`, its mini `<TimeSplitBar>`, its own derived elevation from `deriveVisuals`. This makes the grid a genuine preview of the redesign, not just of colour, and it is the best possible smoke test that the derived layer works across all 17 themes.
- The active theme's card carries an `accent` border and a `photoChipBg` "Active" badge.
- **Step 2 (full preview):** unchanged in behaviour — it renders the redesigned R6.3 Recipe detail live in the tapped theme. **Apply theme** is a `<PillButton variant="accent">` firing the R3 light haptic.
- Cards wrap two-up; no horizontal scroll.

### R6.15 Debug (base §12.3)

Chrome tier, at low intensity. It is a developer tool and must stay information-dense — but "developer tool" is not a licence for it to be the one screen that looks broken.

- `<ScreenHeader>` with the existing back affordance, and its safe-area bottom padding preserved (base §1.3 names this screen as having been bitten once already).
- Filter chips wrap; the log level chips use the existing category colours.
- Each log entry is a `<ListRow>` on alternating `bg` / `surface` grounds — no per-entry `<Card>`, which would halve the entries per screen.
- Everything stays mono at `xs`/`sm`. No Fraunces beyond the header, no elevation on entries, no radius softening. `JsonViewer` keeps its monospace tree exactly as-is, gaining only the themed `surfaceWarm` ground and the `<Sheet>` when presented modally.
- Export remains a `<PillButton variant="ghost">`.

### R6.16 Shared chrome

#### R6.16.1 Tab bar (base §5.1)

Keeps `tabBarBg` (the dark-theme one-step-darker rule, base §4.3, is unchanged) and gains an upward `e1` shadow so content passes *under* it. The active tab shows its label in `accentText` over a `accentSoft` pill behind the icon; inactive tabs stay `ink-4`. Safe-area bottom padding is unchanged. **No haptic on tab change** — R7 forbids it.

#### R6.16.2 Modals & sheets

All nine shared modals (`ConfirmModal`, `DatePickerModal`, `GenericSortMenu`, `SortMenu`, `UnitPickerModal`, `PantryUnitPickerModal`, `RecipePickerModal`, `MonthYearJumpModal`, `EmojiPicker`) plus the four screen-local sheets (`AvatarSheet`, `FavouritePickerModal`, `IngredientPriceSheet`, `RatingBreakdownSheet`, `FeelingPickerSheet`) mount inside the single `<Sheet>` primitive (R5). Backdrop is a scrim over the whole viewport; the sheet itself is `--surface` with `hero`-radius top corners, an `ink-4` grabber, and `useSafeAreaInsets().bottom` padding. `ConfirmModal`'s destructive action keeps its `red` label.

#### R6.16.3 Loading & error (`App.tsx`)

The first thing anyone sees on a cold start, and currently a bare spinner. It becomes the `warmHero` gradient ground (R2.2) with the wordmark in Fraunces `hero` and the spinner in `accent` beneath. The error screen keeps its plain composition but moves onto `<Card level={2}>` with the message in `ink-2` — an error is not an occasion for decoration.

#### R6.16.4 PhotoViewer — **exempt** (base §5.9)

Already a sanctioned exception in the base spec: fixed near-black backdrop and near-white chrome regardless of theme, because a themed light ground fights the photograph instead of framing it. Unchanged by this redesign. Its literals move to `theme.onPhoto` (R2.4) so the "no hex in components" rule holds without changing a single rendered pixel.

#### R6.16.5 Empty states

Every screen gets one, via `<EmptyState>` (R5) — base §14's S17 already requires this and R1.0 left it unassigned. The tone follows base §1.1's no-nagging principle: an empty pantry is a fact, not a failure. Never a bare "No data".

---

## R7. Hard rules (redesign additions to base §15)

- **No horizontal scrolling, anywhere.** Every row of cards, chips, recommendations, or filters **wraps** to the next line. No `horizontal` ScrollViews, no carousels. *(Direct client instruction.)*
- **No flat bordered cards.** Every card-level surface is a `<Card>` with an R2.1 shadow. A bare `View` with a 1px border is a redesign bug.
- **No hex literals in components — still.** New visual values come from `theme.elevation/gradients/glow/onPhoto` (R2), derived centrally. The base §15 constraint is unweakened.
- **Photos lead; the fallback is always designed.** Never render a recipe at card/hero size as a plain emoji-on-grey (R4).
- **One editorial moment per screen.** A screen has exactly one hero/headline focal point; the rest stays quiet (R1.5).
- **Every surface has a tier.** Editorial, Chrome, or Exempt (R6). A screen not listed in the R6.7 coverage map is a spec bug, and an Exempt surface must state its reason — "we ran out of time" is not one.
- **Chrome screens don't compete.** No serif hero, no photo hero, no glow outside the Editorial tier. Boldness is spent once per app, not once per screen.
- **Every modal is a `<Sheet>`.** No screen hand-rolls a modal ground, backdrop, or radius.
- **Colour is never the only signal.** Diffs, sync states, and status rows carry a glyph or label alongside the colour — several themes deliberately reuse one token across two roles (`green` = `accent` in Seaglass and Midnight Kitchen), so hue alone cannot carry meaning.
- **Haptics commit, never narrate.** Fire on deliberate actions only (R3); never on scroll or tab change.
- **Both modes, all 17 themes.** Every derived value is snapshot-tested across the full roster (R9). The redesign must look intentional in Midnight Kitchen and Abyss, not just Hearth.

---

## R8. Dependency additions

Append to base §15.1 (Runtime):

```
expo-linear-gradient     gradients, photo scrims, hero glow (R2.2–R2.4, R3)
expo-haptics             tactile feedback on committing actions (R3)
```

Both are first-party Expo SDK 54 modules. Nothing else is added — no animation, blur, or view-shot libraries in this phase.

---

## R9. Rollout

A polish pass that slots in as an **expanded S17** (base §14) — it can also run standalone since every screen already exists.

1. **Foundation.** Add the two deps (R8). Build `deriveVisuals` (R2) + `VisualTokens` type; extend `ThemeContext` to expose it. Snapshot-test the derived layer across all 17 themes (a token-completeness test already exists — base §11.2 — extend it).
2. **Primitives.** `<Card>`, `<RecipePhoto>`, `<SectionLabel>`, `<PillButton>`, `<HeroCover>`, `<GlowField>`, `<MacroTiles>`, `<Sheet>`, `<ScreenHeader>`, `<ListRow>`, `<EmptyState>` (R5). Unit + snapshot per theme.
3. **Home first** (R6.1) — the highest-impact screen; ship it, feel it on-device (target devices, base §1.3).
4. **Roll outward through the Editorial tier:** Recipe detail → Recipes → Cook log → Plan → Profile (R6.2–R6.6), migrating each screen's flat cards to `<Card>` and swapping `EmojiTile` for `<RecipePhoto>`.
5. **Shared chrome** (R6.16): tab bar, `<Sheet>` migration for all thirteen modals, loading/error, empty states. Doing this before the Chrome tier means most Chrome screens are half-redesigned by the time they're opened.
6. **Chrome tier**, in dependency order: Me subtree (R6.11) → cook flow (R6.8) → recipe authoring (R6.9) → Plan siblings (R6.10) → household (R6.12) → sharing (R6.13) → theme picker (R6.14) → debug (R6.15).
7. **Sweep.** Grep for the two banned patterns — `horizontal` on a `ScrollView`/`FlatList`, and hex literals in components — and confirm zero hits outside the R2.4/R6.16.4 sanctioned tokens. The two known violations are `recipes/IngredientPriceSheet.tsx:139` and `recipes/EmojiPicker.tsx:32`.
8. **Verify** on both target phones (base §1.3), light and a dark theme, with and without photos present, reduced-motion on and off.

Tests ship with each step (base §11, §15). No behaviour changes means existing behavioural tests must keep passing untouched — a redesign that needs a behavioural test rewritten has changed something it shouldn't.

---

## R10. Changelog

**R1.2** — **Two functional additions folded into the slice** (base spec v1.7), with their visual rules, and nothing else changed. R6.9.1 gains the recipe form's **Section control** — a `<ListRow>` opening a single-select `<Sheet>`, deliberately not a chip row, so it cannot be mistaken for the multi-select tags beneath it. R6.8.1 gains the **ready state** (**Start cooking** `<PillButton>`, resting clock in `ink-3`) and the **lane tab strip** (wrapping, ≥44px targets, mandatory state glyphs per R7, `accentTint` active, `amberText` overdue, no haptic on auto-switch). Cooking Mode **stays Exempt** — these are legibility and function, and the exemption's reasoning (base §1.1's hostile environment) is what dictated their styling. No change to the Editorial tier, the coverage map, the primitives, or any hard rule.

**R1.1** — **Coverage completed.** R1.0 specified six screens; the audit for base-spec S18 found ~45 distinct surfaces in the codebase. Every one is now assigned a tier (R6 intro) and a rule (R6.7 coverage map). Adds the **three-tier model** — Editorial (the six primary screens, unchanged from R1.0), **Chrome** (calm `<Card>`/`<ListRow>` treatment, no hero, no glow — R6.8–R6.15), and **Exempt** (Cooking Mode and PhotoViewer, each with a stated reason). Adds four primitives to R5: `<Sheet>`, `<ScreenHeader>`, `<ListRow>`, `<EmptyState>`. Documents two existing R7 violations to fix (`IngredientPriceSheet.tsx:139`, `EmojiPicker.tsx:32`). Adds four hard rules to R7, including *colour is never the only signal* — several themes reuse one token for two roles, so hue alone cannot carry meaning. R9 rollout expanded from 5 steps to 8. No behavioural change and no change to R1.0's Editorial-tier designs.

**R1.0** — Initial visual redesign spec. Establishes the "Warm Editorial" language (client-approved blend of exploration directions A + B): cosy warm grounds and softly-shadowed rounded cards, lifted by one editorial photo-led hero per screen. Adds a centrally-derived visual layer (elevation, gradients, glow, photo scrim — R2) that respects the base token architecture with zero new per-theme slots and no component-level hex. Makes real photos lead with a category-tinted gradient fallback (R4). Adds `expo-linear-gradient` + `expo-haptics` (R8). Bans horizontal scrolling app-wide and flat bordered cards (R7). Redesigns all six primary screens' layouts (R6) with **no behavioural change** to the base spec.
