# Dishision — Where the "wow" is missing

**Status:** Opinion piece, not a spec. Nothing here is binding; it's a read of the app as it stands on `appearance-redesign`, mid-S18.
**Question it answers:** *"It's not wowing enough — is that the app, the implementation, or missing features?"*

---

## The short answer

**It's mostly not the implementation, and it's mostly not a shortage of features.** The app has ~45 screens, 37 themes, a real recommendation engine, phone-to-phone sync, ingredient pricing, pack-rounding, and drift-aware cooking timers. Feature count is not the problem — if anything, there's more here than most people would finish.

Two things are actually missing, and they're the whole gap:

1. **There are no photographs.** A food app that never shows food cannot wow anyone, and right now Dishision literally cannot: nothing in the app can attach a photo to a recipe. Every recipe tile in the redesign — the photo-led redesign — falls back to an emoji on a gradient. 54 seeded recipes, 54 gradients.
2. **Nothing in the app is a *moment*.** Every screen is competent and informational. Nothing surprises, congratulates, reveals, or feels like a gift. The app answers questions; it never performs.

Everything below is downstream of those two.

---

## 1. The photo problem (the single highest-leverage fix in the app)

**What I found.** `recipe.photo_uri` exists in the schema (migration 001) and flows all the way through `EnrichedRecipe.photoUri` into the new `<RecipePhoto>`. The compression pipeline exists and works — `src/photos/pickAndCompressPhoto.ts`. It's wired into **cook log photos** and the **profile avatar**.

It is *not* wired into the recipe form. Searching the whole codebase, the only thing that ever writes `photo_uri` is [importRecipe.ts:98](src/sharing/importRecipe.ts) — i.e. a recipe can only get a photo if somebody else sends you one.

**Why it matters more than anything else here.** The entire visual redesign is built on the premise "photos lead, with a designed fallback" (redesign R4). We built the fallback beautifully and never built the path to the thing it's a fallback *for*. Warm gradient tiles are a good placeholder; forty of them in a row is a mood board, not a cookbook. The difference between "nice indie app" and "wow, this looks expensive" is almost entirely whether the screen is full of real food.

**The fix, in order of impact per hour:**

- **(a) Photo picker in the recipe form.** ~2 hours. The pipeline, the compressor, and the storage column already exist; it's a button, a call to `pickAndCompressPhoto`, and a `photo_uri` write. This is spec'd as a future slice in redesign R4 and should be pulled forward into S18 — the redesign is incoherent without it.
- **(b) Take a photo *from cooking mode / cook complete*.** ~1 hour on top of (a). This is the moment the dish exists and looks its best, and the cook is already holding the phone. Cook complete already collects photos for the log — offer "use this as the recipe photo too" with one tap. That single checkbox is how the library fills itself over a few weeks without anyone doing data entry.
- **(c) Photos for the 54 seeded recipes.** This is a content job, not a code job, and it's the one that makes the app impressive *on first launch* rather than after a month of use. Options: shoot them yourself over a few cooks (slow, authentic, free), or source permissively-licensed food photography and ship it in the bundle. Note the base spec's §1.2 currently declares "no recipe photos in the seed for v1" — worth revisiting, because first launch is exactly when someone decides whether an app is impressive.

If you only do one thing from this document, do (a) + (b).

---

## 2. There's no moment

The app is honest, calm, and quietly clever — and it never once shows off. Some specific places where a moment costs very little:

**First launch.** There is no onboarding, no welcome, nothing. The app opens straight into Home with 54 seeded recipes already there and no explanation of why it's different from every other recipe app. Someone handed the phone gets no story. *Even three swipeable cards* ("Tell it how you feel → it decides → it learns what you actually cook") would frame everything that follows. ~3 hours.

**Cook complete.** Right now: a form. Servings, leftovers, pantry usage, rating. All useful, zero occasion. This is the one screen that is *unambiguously* a good moment — you just cooked something — and it should feel like one: the dish's photo, "7th time you've made this", "your highest-rated dinner this month", the streak, a confetti-free but genuine bit of warmth. ~3 hours. (Redesign R6.8.2 already nudges this direction; go further than it says.)

**The decision itself.** The app's premise, per §1 of the spec, is *"what are we cooking tonight?"* — but the answer arrives as a card in a list. There's no single-tap "just decide for me" with a beat of anticipation and a reveal. The engine is already excellent; it's just not dramatised. A **"Decide for us"** button on Home that picks, animates briefly, and lands on one dish with a reason underneath ("you haven't had fish in 12 days, and you have everything for this") would be the most demo-able thing in the app. ~4 hours, and it uses machinery that already exists.

**Her, specifically.** Household sync is built and it's genuinely impressive engineering — and emotionally it currently surfaces as a sync log and a ratings breakdown. The payoff of two phones knowing each other should be *felt*: "She rated this 5★" on the recipe card. "Cooked together 4 times." "Her top dish this month." Same data you already sync, surfaced where it lands emotionally rather than in a diagnostic screen. ~4 hours, and this is the one that's aimed squarely at your actual audience of one.

---

## 3. Strengths that are currently invisible

Several of the best things in this app are hidden behind a tap or presented as plumbing. Cheap wins:

- **37 themes.** That's an absurd, delightful number, buried in Profile → Appearance. That's a party trick — it belongs somewhere it can be *found* and shown off, and the two-step picker (grid → live preview) is already the right interaction.
- **The TimeSplitBar.** Genuinely the app's most distinctive element: hands-on vs passive time as a single glanceable bar. It's small and quiet everywhere it appears. Make it bigger on Recipe detail; it's a signature.
- **Drift-aware cooking.** "4 min behind, and the pot that's already simmering doesn't care" is real engineering nuance almost nothing else does. Nobody will ever notice unless the app says so out loud, once, at the right moment.
- **Cost per serving and pack-rounding.** "1 bag (200 g) — recipes need 140 g" is the kind of detail that makes people trust software. It's presented as a footnote.

None of this needs building. It needs *promoting*.

---

## 4. Small things that quietly cheapen it

Found while reading, all fixable in under an hour each:

- **The "Sound" alert toggle does nothing.** `alert_sound` is stored and read by `getAlertSound`, and the Settings row toggles it — but the foreground alert path in `CookingModeScreen` only ever calls `Vibration.vibrate()`. Nothing plays a sound, ever. Meanwhile [notifications.ts:21](src/cooking/notifications.ts) hardcodes `shouldPlaySound: true`, so background notifications play sound *regardless* of the toggle. Either implement it (needs an audio dep, currently off the §15.1 allowlist) or remove the switch — a control that lies is worse than a missing feature.
- **The tab bar is emoji.** 🏠🍳🛒🍽️🙂 across the bottom is the single most visible "prototype" tell in the app, and it's the one thing on screen at all times. The codebase already has a proper SVG icon set (`src/components/icons.tsx`) — five more paths there would change the app's first impression more than any individual screen redesign.
- **The shopping list can't leave the phone.** No share, no export, no copy-as-text. It's the one artefact you'd naturally want to send to someone standing in a shop. `expo-sharing` is already a dependency.
- **Home's greeting is static per state.** Three fixed strings. The spec explicitly allows rotating copy; rotation is what makes an app feel alive on the fifth open rather than the first.

---

## 5. What I'd actually do, in order

Ranked by wow-per-hour, assuming the S18 redesign continues in parallel:

| # | Thing | Effort | Why it's here |
| --- | --- | --- | --- |
| 1 | Recipe photo picker (form + "use as recipe photo" on cook complete) | ~3h | Unblocks the entire visual redesign |
| 2 | Real icons in the tab bar | ~1h | Always on screen; biggest prototype tell |
| 3 | "Decide for us" moment on Home | ~4h | Dramatises the app's whole premise |
| 4 | Cook complete as an occasion | ~3h | The one guaranteed good moment, currently a form |
| 5 | Her ratings surfaced on recipe cards | ~4h | Aims the best engineering at the actual audience |
| 6 | Seed photos for the 54 recipes | content | Makes first launch impressive, not just week three |
| 7 | Fix or remove the Sound toggle | ~1h | Trust |
| 8 | Share the shopping list | ~1h | Obvious daily want |
| 9 | First-run onboarding | ~3h | Frames everything else |

**Items 1, 2 and 6 are the ones that change how the app *looks*.** Items 3, 4 and 5 are the ones that change how it *feels*. If the goal is a specific person going "oh, that's lovely" — do 1, 2, 4, 5.

---

## 6. The honest caveat

I reviewed this by reading the code, not by using the app on a phone. Some of "it's not wowing" may be things that only show up in the hand — animation timing, scroll feel, how the fonts land at real size, how fast Home loads on the 12 Lite. The redesign's own R9 step 8 calls for on-device verification and it hasn't happened yet; the derived shadows and the new hero in particular are things I've only seen as snapshots. Worth doing that pass before concluding the problem is features rather than feel.

And one thing worth saying plainly: the reason this app doesn't wow yet is *not* that it was built badly. It's built with more care than most shipped software — the schema, the honest-degradation rule, the log-as-truth principle, the test suite. It's a well-built thing that has never been dressed up. That's a much better problem to have than the reverse.
