# Preppie — Visual Redesign Spec (Warm Editorial)

**Version:** R1.0
**Companion to:** `preppie-spec.md` (the *base spec*) — this document does **not** replace it
**Platform:** React Native / Expo SDK 54
**Status:** Specification — supersedes the *visual presentation* of the base spec's §4.5–4.8 and the *layout* of §5.2–5.10

---

## R0. What this document is (and isn't)

The base spec (`preppie-spec.md`) defines **what Preppie is** — data model, units, recommendation engine, sharing, the theme *architecture*, and the behaviour of every screen. All of that stands unchanged.

This document defines **how Preppie looks and feels**. It exists because the first build, while functionally complete, reads as a prototype: flat cards, no depth, no focal point, emoji-in-a-grey-box, no motion. The goal is a **polished, "designed" app** — not new features.

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

**Removed pattern:** the flat `{ backgroundColor: surface, borderRadius: 13, borderWidth: 1, borderColor: border }` card. Migrate every occurrence to `<Card>`.

---

## R6. Screen redesigns

Each screen keeps its exact behaviour, state machine, and data flow from the base spec. Only structure and styling change. `[photo]` denotes a `<RecipePhoto>` (real image or fallback tile).

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
│  STILL GOOD                    │
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

---

## R7. Hard rules (redesign additions to base §15)

- **No horizontal scrolling, anywhere.** Every row of cards, chips, recommendations, or filters **wraps** to the next line. No `horizontal` ScrollViews, no carousels. *(Direct client instruction.)*
- **No flat bordered cards.** Every card-level surface is a `<Card>` with an R2.1 shadow. A bare `View` with a 1px border is a redesign bug.
- **No hex literals in components — still.** New visual values come from `theme.elevation/gradients/glow/onPhoto` (R2), derived centrally. The base §15 constraint is unweakened.
- **Photos lead; the fallback is always designed.** Never render a recipe at card/hero size as a plain emoji-on-grey (R4).
- **One editorial moment per screen.** A screen has exactly one hero/headline focal point; the rest stays quiet (R1.5).
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
2. **Primitives.** `<Card>`, `<RecipePhoto>`, `<SectionLabel>`, `<PillButton>`, `<HeroCover>`, `<GlowField>`, `<MacroTiles>` (R5). Unit + snapshot per theme.
3. **Home first** (R6.1) — the highest-impact screen; ship it, feel it on-device (target devices, base §1.3).
4. **Roll outward:** Recipe detail → Recipes → Cook log → Plan → Profile (R6.2–R6.6), migrating each screen's flat cards to `<Card>` and swapping `EmojiTile` for `<RecipePhoto>`.
5. **Verify** on both target phones (base §1.3), light and a dark theme, with and without photos present, reduced-motion on and off.

Tests ship with each step (base §11, §15). No behaviour changes means existing behavioural tests must keep passing untouched — a redesign that needs a behavioural test rewritten has changed something it shouldn't.

---

## R10. Changelog

**R1.0** — Initial visual redesign spec. Establishes the "Warm Editorial" language (client-approved blend of exploration directions A + B): cosy warm grounds and softly-shadowed rounded cards, lifted by one editorial photo-led hero per screen. Adds a centrally-derived visual layer (elevation, gradients, glow, photo scrim — R2) that respects the base token architecture with zero new per-theme slots and no component-level hex. Makes real photos lead with a category-tinted gradient fallback (R4). Adds `expo-linear-gradient` + `expo-haptics` (R8). Bans horizontal scrolling app-wide and flat bordered cards (R7). Redesigns all six primary screens' layouts (R6) with **no behavioural change** to the base spec.
