// §6 recommendation engine orchestrator. Pure and DB-free — everything it
// needs (the library, weights, yesterday's protein, now) is passed in, so
// the whole pipeline is unit-testable without a database (§11.2). The async
// DB-touching half (loading the library, resolving yesterday's cook, the
// median/daily caches) lives in dailyCache.ts, which calls into this.
import type { EnrichedRecipe } from '../recipes/loadRecipes';
import type { RecommendationWeights } from '../settings/getSetting';
import { pickDiverse } from './diversity';
import { applyHardFilters } from './hardFilters';
import { relaxationLadder, RELAXATION_LABEL } from './relaxationLadder';
import { effectiveWeights, scoreRecipe } from './score';

export interface RecommendContext {
  now: number;
  recencyWindowDays: number;
  yesterdaysPrimaryProtein: string | null;
  weights: RecommendationWeights;
  /** Injectable for deterministic tests; defaults to Math.random in real use. */
  random?: () => number;
}

export interface LadderStep {
  windowDays: number;
  survivorCount: number;
}

export interface RecommendResult {
  /** Top picks, diversity-ruled, best first. Empty when the library has nothing eligible at all. */
  picks: EnrichedRecipe[];
  /** The recency window actually used to reach >=3 survivors (or the last rung tried). */
  usedWindowDays: number;
  /** Every rung the ladder walked before landing, for the Debug screen / honest UI labelling (§6.3). */
  ladderSteps: LadderStep[];
  /** True once the ladder had to step down from the starting window. */
  relaxed: boolean;
  relaxationLabel: string | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function computeRecommendations(allRecipes: EnrichedRecipe[], ctx: RecommendContext): RecommendResult {
  const random = ctx.random ?? Math.random;
  const ladder = relaxationLadder(ctx.recencyWindowDays);

  const ladderSteps: LadderStep[] = [];
  let survivors: EnrichedRecipe[] = [];
  let usedWindowDays = ladder[0];
  for (const windowDays of ladder) {
    survivors = applyHardFilters(allRecipes, {
      now: ctx.now,
      recencyWindowDays: windowDays,
      yesterdaysPrimaryProtein: ctx.yesterdaysPrimaryProtein,
    });
    ladderSteps.push({ windowDays, survivorCount: survivors.length });
    usedWindowDays = windowDays;
    if (survivors.length >= 3) break;
  }

  // §6.5 degradation: computed over the whole library, not just survivors —
  // "how sparse is my rating data overall" is a library-wide question.
  const ratedFraction = allRecipes.length === 0 ? 0 : allRecipes.filter((r) => r.avgRating != null).length / allRecipes.length;
  const weights = effectiveWeights(ctx.weights, ratedFraction);
  const maxTimesCooked = allRecipes.reduce((max, r) => Math.max(max, r.timesCooked), 0);

  const scored = survivors
    .map((recipe) => {
      const daysSinceLastCooked = recipe.lastCookedAt != null ? (ctx.now - new Date(recipe.lastCookedAt).getTime()) / MS_PER_DAY : null;
      const score = scoreRecipe(
        { daysSinceLastCooked, avgRating: recipe.avgRating, timesCooked: recipe.timesCooked, maxTimesCooked },
        weights,
        random(),
      );
      return { recipe, score };
    })
    .sort((a, b) => b.score - a.score);

  const picks = pickDiverse(
    scored.map((s) => s.recipe),
    3,
  );

  const relaxed = usedWindowDays !== ladder[0];
  return {
    picks,
    usedWindowDays,
    ladderSteps,
    relaxed,
    relaxationLabel: relaxed ? RELAXATION_LABEL : null,
  };
}
