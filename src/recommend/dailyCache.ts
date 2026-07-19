// §6.1: "Recomputed on app open, cached against the date so picks don't
// shuffle mid-day." Persisted in the `setting` table (not component state)
// because Home unmounts on every tab switch (TabShell only renders the
// active tab) — an in-memory cache would reshuffle jitter on every visit.
import { logger } from '../debug/logStore';
import { localDateKey } from '../lib/formatDate';
import { recipePrimaryProtein, type EnrichedRecipe } from '../recipes/loadRecipes';
import { getRecencyWindowDays, getRecommendationWeights, getSetting } from '../settings/getSetting';
import { setSetting } from '../settings/setSetting';
import type { DbClient } from '../db/DbClient';
import { computeRecommendations, type RecommendResult } from './recommend';
import { getYesterdaysCookedRecipeId } from './yesterdaysProtein';

const DATE_KEY = 'recommendation_cache_date';
const PICKS_KEY = 'recommendation_cache_picks';

// Re-hydrates cached recipe ids against the *current* enriched recipe list,
// so a cached pick still reflects today's live data (pantry, favourite,
// etc.) even though the identity of the pick itself is pinned for the day.
// Recipes deleted since caching are dropped silently.
function hydrate(ids: number[], allRecipes: EnrichedRecipe[]): EnrichedRecipe[] {
  const byId = new Map(allRecipes.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is EnrichedRecipe => r != null);
}

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

  const [recencyWindowDays, weights, yesterdaysRecipeId] = await Promise.all([
    getRecencyWindowDays(db),
    getRecommendationWeights(db),
    getYesterdaysCookedRecipeId(db, now),
  ]);
  const yesterdaysRecipe = yesterdaysRecipeId != null ? allRecipes.find((r) => r.id === yesterdaysRecipeId) ?? null : null;
  const yesterdaysPrimaryProtein = yesterdaysRecipe ? recipePrimaryProtein(yesterdaysRecipe) : null;

  const result = computeRecommendations(allRecipes, {
    now,
    recencyWindowDays,
    yesterdaysPrimaryProtein,
    weights,
  });

  await setSetting(db, DATE_KEY, todayKey);
  await setSetting(db, PICKS_KEY, JSON.stringify(result.picks.map((r) => r.id)));
  logger.info('engine', 'Recommendations computed', {
    top: result.picks.map((r) => ({ id: r.id, name: r.name })),
    ladderSteps: result.ladderSteps,
    relaxed: result.relaxed,
  });

  return result;
}

// Called whenever something that should re-shuffle today's picks happens
// (e.g. a "not tonight" dismissal) — clears the daily pin so the next read
// recomputes rather than serving a pick that was just dismissed.
export async function invalidateDailyRecommendations(db: DbClient): Promise<void> {
  await db.runAsync(`DELETE FROM setting WHERE key IN ('${DATE_KEY}', '${PICKS_KEY}')`);
}
