// §6.1: "Recomputed on app open, cached against the date so picks don't
// shuffle mid-day." Persisted in the `setting` table (not component state)
// because Home unmounts on every tab switch (TabShell only renders the
// active tab) — an in-memory cache would reshuffle jitter on every visit.
import { logger } from '../debug/logStore';
import { localDateKey } from '../lib/formatDate';
import { recipePrimaryProtein, type EnrichedRecipe } from '../recipes/loadRecipes';
import { getRecencyWindowDays, getRecommendCategories, getRecommendationWeights, getSetting } from '../settings/getSetting';
import { setSetting } from '../settings/setSetting';
import type { DbClient } from '../db/DbClient';
import { computeRecommendations, type RecommendResult } from './recommend';
import { getYesterdaysCookedRecipeId } from './yesterdaysProtein';

const DATE_KEY = 'recommendation_cache_date';
const PICKS_KEY = 'recommendation_cache_picks';

// The cached list holds more than the 3 Home shows (§6.1, §6.7): a deep
// enough bench that dismissing #1 can promote #2/#3 up and pull a fresh #3
// from reserve, without recomputing (and reshuffling jitter on) the whole
// set just because one dish was dismissed.
const BENCH_SIZE = 10;

// Re-hydrates cached recipe ids against the *current* enriched recipe list,
// so a cached pick still reflects today's live data (pantry, favourite,
// etc.) even though the identity of the pick itself is pinned for the day.
// Recipes deleted since caching are dropped silently.
function hydrate(ids: number[], allRecipes: EnrichedRecipe[]): EnrichedRecipe[] {
  const byId = new Map(allRecipes.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is EnrichedRecipe => r != null);
}

async function computeAndCacheBench(db: DbClient, allRecipes: EnrichedRecipe[], now: number, todayKey: string): Promise<RecommendResult> {
  const [recencyWindowDays, weights, yesterdaysRecipeId, allowedCategories] = await Promise.all([
    getRecencyWindowDays(db),
    getRecommendationWeights(db),
    getYesterdaysCookedRecipeId(db, now),
    getRecommendCategories(db),
  ]);
  const yesterdaysRecipe = yesterdaysRecipeId != null ? allRecipes.find((r) => r.id === yesterdaysRecipeId) ?? null : null;
  const yesterdaysPrimaryProtein = yesterdaysRecipe ? recipePrimaryProtein(yesterdaysRecipe) : null;

  const result = computeRecommendations(allRecipes, {
    now,
    recencyWindowDays,
    yesterdaysPrimaryProtein,
    weights,
    allowedCategories,
    benchSize: BENCH_SIZE,
  });

  await setSetting(db, DATE_KEY, todayKey);
  await setSetting(db, PICKS_KEY, JSON.stringify(result.picks.map((r) => r.id)));
  logger.info('engine', 'Recommendations computed', {
    bench: result.picks.map((r) => ({ id: r.id, name: r.name })),
    ladderSteps: result.ladderSteps,
    relaxed: result.relaxed,
  });

  return result;
}

// Returns the day's bench (up to BENCH_SIZE), best first — Home shows the
// first 3 and keeps the rest in reserve for dismissAndPromote.
export async function getDailyRecommendations(db: DbClient, allRecipes: EnrichedRecipe[], now: number = Date.now()): Promise<RecommendResult> {
  const todayKey = localDateKey(now);
  const [cachedDate, cachedPicksRaw] = await Promise.all([getSetting(db, DATE_KEY), getSetting(db, PICKS_KEY)]);

  if (cachedDate === todayKey && cachedPicksRaw != null) {
    const picks = hydrate(JSON.parse(cachedPicksRaw) as number[], allRecipes);
    if (picks.length >= Math.min(3, allRecipes.length)) {
      return { picks, usedWindowDays: 0, ladderSteps: [], relaxed: false, relaxationLabel: null };
    }
    // Cached picks no longer resolve to enough live recipes (deleted since
    // caching) — fall through and recompute fresh for today.
  }

  return computeAndCacheBench(db, allRecipes, now, todayKey);
}

// §6.7 dismissal: drop the dismissed recipe from today's cached bench and
// promote the rest up, rather than recomputing (and reshuffling) the whole
// set. The caller is expected to have already written the recipe_exclusion
// row — that's what keeps the dismissed dish out if a recompute does end up
// happening below. Falls back to a fresh compute only when the bench itself
// has run dry.
export async function dismissAndPromote(
  db: DbClient,
  dismissedRecipeId: number,
  allRecipes: EnrichedRecipe[],
  now: number = Date.now(),
): Promise<RecommendResult> {
  const todayKey = localDateKey(now);
  const [cachedDate, cachedPicksRaw] = await Promise.all([getSetting(db, DATE_KEY), getSetting(db, PICKS_KEY)]);

  if (cachedDate === todayKey && cachedPicksRaw != null) {
    const remainingIds = (JSON.parse(cachedPicksRaw) as number[]).filter((id) => id !== dismissedRecipeId);
    const picks = hydrate(remainingIds, allRecipes);
    const enoughLeft = picks.length >= Math.min(3, Math.max(allRecipes.length - 1, 0));
    if (enoughLeft) {
      await setSetting(db, PICKS_KEY, JSON.stringify(remainingIds));
      logger.info('engine', 'Promoted next recommendation after dismissal', {
        dismissedRecipeId,
        remaining: remainingIds.length,
      });
      return { picks, usedWindowDays: 0, ladderSteps: [], relaxed: false, relaxationLabel: null };
    }
  }

  // Bench exhausted (or nothing cached yet for today) — recompute fresh.
  return computeAndCacheBench(db, allRecipes, now, todayKey);
}

// Called when something other than a normal dismissal should force a full
// reshuffle (e.g. tests, or a settings change that invalidates the whole
// model) — clears the daily pin so the next read recomputes from scratch.
export async function invalidateDailyRecommendations(db: DbClient): Promise<void> {
  await db.runAsync(`DELETE FROM setting WHERE key IN ('${DATE_KEY}', '${PICKS_KEY}')`);
}
