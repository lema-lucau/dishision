# Dishision — Audit follow-up (post product-review build)

**Status:** Opinion/audit, not a spec. Nothing here is binding. A second read of the app on `appearance-redesign` after the nine product-review items landed (recipe photos, real tab icons, "Decide for us", cook-complete occasion, partner ratings on cards, honest Sound toggle, shopping-list share, onboarding + rotating greeting, TimeSplitBar/theme-count/drift promotions).

**Question it answers:** *"We fixed the obvious gaps — what's the next layer down?"*

---

## The short answer

The two structural gaps the last review named — no recipe photos, nothing that's a *moment* — are closed at the source. The next layer is **consistency and finish**, not new features:

1. **Photos now exist but still don't appear in half the places they could.** The pipeline is wired to the recipe form, cook complete, and the main browse tiles — but the Cook Log (the one screen *guaranteed* to hold a real photo of the food), the "I'm feeling…" results, the recipe pickers, and the Home leftovers strip all still render an emoji tile. We built the capability and only half-distributed it.
2. **The app isn't reachable by a screen reader.** ~13 of 76 screens set any accessibility label; the star pickers, +/− steppers, and delete buttons — the controls hardest to guess by shape — have none.
3. **A single render error white-screens the whole app.** There's no error boundary anywhere, and photo URIs + phone-to-phone sync are exactly the surfaces where a runtime throw is plausible.

None of these is a rewrite. They're the difference between "the features are in" and "the app is finished."

---

## 1. Finish distributing photos (the highest-leverage follow-through)

The last review's #1 was "there's no path to attach a photo." That path now exists. But `EmojiTile` is still the thumbnail on these surfaces, so a recipe or cook that *has* a photo doesn't show it:

- **(a) Cook Log tiles — the most wrong one.** [CookLogScreen.tsx:527](src/screens/CookLogScreen.tsx) and [:560](src/screens/CookLogScreen.tsx) render `<EmojiTile emoji={log.photoEmoji}>`, but `CookLogRow` already carries `photos: string[]` — the cook's *own* photo of that meal. This is the single screen most certain to have real food in it, showing an emoji instead. **Zero loader change** — `log.photos[0]` is already in hand; fall back to the recipe photo/emoji when empty. ~30 min, and it's the most food-forward screen in the app.
- **(b) "I'm feeling…" results.** [FeelingPickerSheet.tsx:133](src/recommend/FeelingPickerSheet.tsx) and [:169](src/recommend/FeelingPickerSheet.tsx) use `EmojiTile`. This is a browse surface — swap to `<RecipePhoto recipe={recipePhotoSubject(recipe)}>`, same as the main list/grid already do. ~30 min.
- **(c) Home leftovers strip.** [HomeScreen.tsx:221](src/screens/HomeScreen.tsx) hardcodes `photoUri: null`. `LeftoverRow` ([leftoverMutations.ts](src/cooking/leftoverMutations.ts)) selects `r.photo_emoji` but not `r.photo_uri` — add the column to that `SELECT`, thread it through, and leftovers show the dish. ~30 min.
- **(d) Recipe pickers.** `RecipePickerModal` and the Plan calendar/week strip ([PlanScreen.tsx](src/screens/PlanScreen.tsx)) still use `EmojiTile`. Lower priority (small cells), but the picker especially benefits. ~1 h combined.

All four ride on the same `recipePhotoSubject()` helper that already exists. **(a) alone is the one to do** — it's the cheapest and lands hardest.

---

## 2. Accessibility is essentially absent

A screen-reader user can't operate the app today. The count: ~13 of 76 `.tsx` files set any `accessibilityLabel`/`accessibilityRole` (household and recommend directories: zero). The controls that need it most are the icon-only ones a blind user can't infer:

- **Star ratings** ([CookCompleteScreen.tsx:358](src/recipes/CookCompleteScreen.tsx), RecipeDetail) — a row of ☆ with no labels reads as nothing. Each needs `accessibilityRole="button"` + `accessibilityLabel={\`Rate ${n} stars\`}`.
- **+/− steppers** (servings, buy-count, weights — CookComplete, RecipeDetail, ShoppingList, Settings) — announce as unlabelled buttons.
- **Delete / reorder** (`✕`, `↑`, `↓` in RecipeForm, ShoppingList) — destructive controls with no spoken identity.
- **Layout toggles, search, chevrons** — the emoji/glyph controls in §3 below.

This is a broad but shallow pass: a labelling sweep plus `accessibilityRole` on pressables. It doesn't change a single layout. ~1 day for the whole app; a half-day gets the destructive and rating controls, which are the ethical minimum.

---

## 3. Emoji-as-icon, one level down from the tab bar

The tab-bar fix removed the loudest prototype tell. The same tell survives in-screen: `🔍` search, `📅` calendar, `⊞`/`☰` layout toggles, and `▸`/`▾` chevrons across ~10 screens (ShoppingList, Pantry, Ingredients, CookLog, FeelingPicker, ManageVisibility, MealSection, FilterChipBar…). Meanwhile `components/icons.tsx` now has `SearchIcon`, `GridIcon`, `ListIcon`, `CalendarIcon`, `ChevronRightIcon` — several already used only in Cooking Mode.

The set exists; it just needs adopting. A shared `<SearchField>` and `<LayoutToggle>` primitive would fix every screen at once and stop the drift recurring. ~half a day, and it doubles as the labelled, accessible version for §2.

---

## 4. No error boundary

Any exception thrown during render takes the whole app to a blank screen with no recovery — the user's only move is a force-quit. The risky surfaces are real: a malformed `photo_uri`, a null deref on partially-synced household data, a bad migration on an old backup. A single root `ErrorBoundary` (wrap `ThemedRoot` in [App.tsx](App.tsx)) with a warm fallback — "Something went wrong; your data is safe" + a "the debug log has details" hint — turns a white screen into a recoverable one. ~1–2 h including a test. The `logger` already exists to capture the stack.

---

## 5. Photo files are never deleted from disk

`compressPhoto` writes each photo to `Paths.document/photos/<uuid>.jpg` ([compressPhoto.ts:64](src/photos/compressPhoto.ts)) and **nothing ever removes one.** Deleting a recipe or cook log drops the row but leaves the file; replacing a recipe photo (now easy, via "use as recipe photo" on every cook) orphans the previous file each time. Correctness is fine — no dangling URI is ever read — but storage grows unbounded, and the new photo features make it grow faster.

The honest fix is a mark-and-sweep GC: on app start (or in the existing auto-backup pass), list `photos/`, diff against every `photo_uri` / `cook_log_photo.uri` / avatar in the DB, delete the unreferenced. ~2–3 h, and it wants a careful test (deleting a *referenced* file is the one unacceptable bug). Low urgency, but it's a slow leak that only worsens with use.

---

## 6. Data loading re-does the whole library on every change

`loadEnrichedRecipes` runs ~15 queries and fully enriches *every* recipe (nutrition, cost, pantry, ratings), and Home/Recipes/Plan call it via `await reload()` after a single-recipe mutation — favourite toggle, exclusion, a cook. At 54 recipes it's imperceptible; on the 12 Lite with a few hundred it will show as a hitch after every tap, and the lists render through `ScrollView` + `.map` (bounded only by the page-size control), not `FlatList`.

Not worth doing now — but worth knowing the ceiling. When it bites, the levers in order: (1) a targeted `loadOneEnrichedRecipe(id)` for single-row mutations, (2) `FlatList` for the long browse lists, (3) memoise the price/rating batch loads across a session. The review's own R9 on-device pass (§6 below) is where this would first surface.

---

## 7. Smaller things found while reading

- **`Share.share` has no `try/catch`** ([ShoppingListScreen.tsx](src/plan/ShoppingListScreen.tsx)) — a dismissed share is fine on Android, but wrapping it guards against an unhandled rejection if the native module is unavailable. ~5 min.
- **No global search.** Search is per-tab; from Home there's no way to jump to a known recipe. "Decide for us" serves the undecided; a search entry on Home would serve the decided. ~2 h.
- **Household rating chip can crowd a long dish name** on the narrow grid card — it's positioned absolute top-left over the photo, which is fine, but on the list row it shares a wrapping meta row. Minor; watch it on-device.
- **The new moments have no tests.** DecideForUs, OnboardingScreen, and the CookComplete occasion header are interaction/snapshot-shaped and currently uncovered. The pure helpers (`decideReason`, `cookMilestones`, `shoppingListText`) *are* tested. ~2–3 h to add render/snapshot coverage.

---

## 8. What I'd do, in order

Ranked by value-per-hour, assuming the redesign continues in parallel:

| # | Thing | Effort | Why it's here |
| --- | --- | --- | --- |
| 1 | Cook Log tiles show the cook's photo | ~30 min | The most food-forward screen, showing an emoji; data already loaded |
| 2 | Photos in Feeling-picker + leftovers + pickers | ~2 h | Finishes distributing the capability we built |
| 3 | Accessibility labels on ratings/steppers/delete | ~half day | The app is currently unusable by a screen reader |
| 4 | Root error boundary | ~1–2 h | Turns a white-screen crash into a recoverable one |
| 5 | Shared `SearchField` / `LayoutToggle` with real icons | ~half day | Kills the remaining prototype tell + serves #3 |
| 6 | Orphaned-photo GC | ~2–3 h | Slow storage leak, worsened by the new photo flows |
| 7 | Tests for the new moments | ~2–3 h | The just-shipped features are uncovered |
| 8 | Global search on Home | ~2 h | Serves the "I already know what I want" path |
| 9 | Targeted reload / FlatList | when it bites | Scale headroom; verify on-device first |

**Items 1–2 finish the last review's headline feature.** Items 3–4 are the finish-quality line between "features in" and "shippable." Everything below is headroom.

---

## 9. The honest caveat (still standing)

This was again a read of the code, not the app in the hand. The last review's R9 step-8 on-device pass **still hasn't happened** — animation timing on "Decide for us", how the new photo heroes land at real size, scroll feel on the 12 Lite, and whether the drift reassurance reads well mid-cook are all things only a phone can tell you. That pass is now more overdue than before, because we added animated and photo-heavy surfaces on top of the ones that were already unverified. It's the single most valuable next hour — ahead of anything in the table above.
