// §5.10 Stats: counts, trends, nutrition, and money — every figure derived
// from cook_log at read time (§2.5), nothing stored. Reuses
// loadEnrichedRecipes for per-serving macro/cost derivation rather than
// re-deriving it, so a recipe's macros are computed exactly one way in
// the whole app.
import type { DbClient } from '../db/DbClient';
import { loadEnrichedRecipes, recipePrimaryProtein } from '../recipes/loadRecipes';
import { localDateKey } from '../lib/formatDate';

export interface CooksPerWeekPoint {
  weekStart: string;
  cooks: number;
}

export interface RatingDriftPoint {
  weekStart: string;
  avgStars: number | null;
}

export interface NutritionWeekPoint {
  weekStart: string;
  avgKcal: number | null;
  avgProtein: number | null;
  avgCarbs: number | null;
  avgFat: number | null;
}

export interface SpendWeekPoint {
  weekStart: string;
  totalSpend: number | null;
  avgCostPerServing: number | null;
}

export interface TagDistributionEntry {
  tag: string;
  count: number;
}

export type TrendDirection = 'up' | 'down' | 'flat';

export interface Trend {
  direction: TrendDirection;
  /** Percentage change of the recent half vs the previous half, or null when there isn't enough data. */
  changePct: number | null;
}

export interface Stats {
  totalCooks: number;
  distinctRecipesCooked: number;
  mostCooked: { recipeId: number; name: string; count: number } | null;
  /** Distinct calendar days cooked in the last 30 days. */
  cookedDaysLast30: number;
  /** Total cooks (not distinct days) in the last 30 days. */
  cooksLast30: number;
  /** All-time average star rating across rated cooks. */
  avgRating: number | null;
  /** All-time total spend (cost per serving × servings made) across cooks with a known cost. */
  totalSpend: number | null;
  /** All-time average macros per serving across cooks with known macros. */
  avgKcal: number | null;
  avgMacros: { protein: number | null; carbs: number | null; fat: number | null };
  trends: { cooks: Trend; rating: Trend; calories: Trend; spend: Trend };
  cooksPerWeek: CooksPerWeekPoint[];
  ratingDrift: RatingDriftPoint[];
  proteinDistribution: TagDistributionEntry[];
  tagDistribution: TagDistributionEntry[];
  nutritionPerWeek: NutritionWeekPoint[];
  spendPerWeek: SpendWeekPoint[];
}

// Recent-half vs previous-half comparison of a weekly series (nulls ignored).
// A change under 5% reads as flat so tiny wobble doesn't show a misleading arrow.
export function computeTrend(values: (number | null)[]): Trend {
  const mid = Math.floor(values.length / 2);
  const prev = values.slice(0, mid).filter((v): v is number => v != null);
  const recent = values.slice(mid).filter((v): v is number => v != null);
  if (prev.length === 0 || recent.length === 0) return { direction: 'flat', changePct: null };
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const a = mean(prev);
  const b = mean(recent);
  if (a === 0) return { direction: b > 0 ? 'up' : 'flat', changePct: null };
  const changePct = ((b - a) / a) * 100;
  const direction: TrendDirection = Math.abs(changePct) < 5 ? 'flat' : changePct > 0 ? 'up' : 'down';
  return { direction, changePct };
}

// Monday of the week containing `dateKey` (YYYY-MM-DD), as a YYYY-MM-DD key.
export function mondayOfWeek(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00`);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return localDateKey(d.getTime());
}

function addDaysKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localDateKey(d.getTime());
}

interface CookLogRow {
  id: number;
  recipe_id: number;
  cooked_at: string;
  servings_made: number;
  stars: number | null;
}

export async function loadStats(db: DbClient, weeks = 12, now: Date = new Date()): Promise<Stats> {
  const logs = await db.getAllAsync<CookLogRow>(
    `SELECT id, recipe_id, cooked_at, servings_made, stars FROM cook_log WHERE completed = 1 ORDER BY cooked_at`,
  );

  const totalCooks = logs.length;
  const distinctRecipesCooked = new Set(logs.map((l) => l.recipe_id)).size;

  const countByRecipe = new Map<number, number>();
  for (const log of logs) countByRecipe.set(log.recipe_id, (countByRecipe.get(log.recipe_id) ?? 0) + 1);

  const recipes = await loadEnrichedRecipes(db);
  const recipeById = new Map(recipes.map((r) => [r.id, r]));

  let mostCooked: Stats['mostCooked'] = null;
  for (const [recipeId, count] of countByRecipe) {
    if (!mostCooked || count > mostCooked.count) {
      mostCooked = { recipeId, name: recipeById.get(recipeId)?.name ?? 'Unknown recipe', count };
    }
  }

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const logsLast30 = logs.filter((l) => new Date(l.cooked_at).getTime() >= thirtyDaysAgo.getTime());
  const cookedDaysLast30 = new Set(logsLast30.map((l) => l.cooked_at.slice(0, 10))).size;
  const cooksLast30 = logsLast30.length;

  // All-time aggregates (across every log, not just the charted window).
  const allStars: number[] = [];
  const allKcal: number[] = [];
  const allProtein: number[] = [];
  const allCarbs: number[] = [];
  const allFat: number[] = [];
  let totalSpendAllTime = 0;
  let hasSpend = false;
  for (const log of logs) {
    if (log.stars != null) allStars.push(log.stars);
    const recipe = recipeById.get(log.recipe_id);
    if (!recipe) continue;
    if (recipe.kcalPerServing != null) allKcal.push(recipe.kcalPerServing);
    if (recipe.proteinPerServing != null) allProtein.push(recipe.proteinPerServing);
    if (recipe.carbsPerServing != null) allCarbs.push(recipe.carbsPerServing);
    if (recipe.fatPerServing != null) allFat.push(recipe.fatPerServing);
    if (recipe.costPerServing != null) {
      totalSpendAllTime += recipe.costPerServing * log.servings_made;
      hasSpend = true;
    }
  }

  // Build `weeks` consecutive Monday-start buckets ending on the current week.
  const currentWeekStart = mondayOfWeek(localDateKey(now.getTime()));
  const weekKeys: string[] = [];
  for (let i = weeks - 1; i >= 0; i--) weekKeys.push(addDaysKey(currentWeekStart, -7 * i));

  const cooksPerWeekMap = new Map<string, number>(weekKeys.map((w) => [w, 0]));
  const starsPerWeek = new Map<string, number[]>(weekKeys.map((w) => [w, []]));
  const kcalPerWeek = new Map<string, number[]>(weekKeys.map((w) => [w, []]));
  const proteinPerWeek = new Map<string, number[]>(weekKeys.map((w) => [w, []]));
  const carbsPerWeek = new Map<string, number[]>(weekKeys.map((w) => [w, []]));
  const fatPerWeek = new Map<string, number[]>(weekKeys.map((w) => [w, []]));
  const spendPerWeek = new Map<string, number>(weekKeys.map((w) => [w, 0]));
  const costPerServingPerWeek = new Map<string, number[]>(weekKeys.map((w) => [w, []]));

  const proteinCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();

  for (const log of logs) {
    const weekStart = mondayOfWeek(log.cooked_at.slice(0, 10));
    if (!cooksPerWeekMap.has(weekStart)) continue; // outside the requested window
    cooksPerWeekMap.set(weekStart, (cooksPerWeekMap.get(weekStart) ?? 0) + 1);
    if (log.stars != null) starsPerWeek.get(weekStart)!.push(log.stars);

    const recipe = recipeById.get(log.recipe_id);
    if (!recipe) continue;

    if (recipe.kcalPerServing != null) kcalPerWeek.get(weekStart)!.push(recipe.kcalPerServing);
    if (recipe.proteinPerServing != null) proteinPerWeek.get(weekStart)!.push(recipe.proteinPerServing);
    if (recipe.carbsPerServing != null) carbsPerWeek.get(weekStart)!.push(recipe.carbsPerServing);
    if (recipe.fatPerServing != null) fatPerWeek.get(weekStart)!.push(recipe.fatPerServing);
    if (recipe.costPerServing != null) {
      spendPerWeek.set(weekStart, (spendPerWeek.get(weekStart) ?? 0) + recipe.costPerServing * log.servings_made);
      costPerServingPerWeek.get(weekStart)!.push(recipe.costPerServing);
    }

    const protein = recipePrimaryProtein(recipe);
    if (protein) proteinCounts.set(protein, (proteinCounts.get(protein) ?? 0) + 1);
    for (const tag of recipe.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }

  const avg = (values: number[]): number | null => (values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length);

  const cooksSeries = weekKeys.map((w) => cooksPerWeekMap.get(w) ?? 0);
  const ratingSeries = weekKeys.map((w) => avg(starsPerWeek.get(w) ?? []));
  const kcalSeries = weekKeys.map((w) => avg(kcalPerWeek.get(w) ?? []));
  const spendSeries = weekKeys.map((w) => ((costPerServingPerWeek.get(w) ?? []).length > 0 ? spendPerWeek.get(w)! : null));

  return {
    totalCooks,
    distinctRecipesCooked,
    mostCooked,
    cookedDaysLast30,
    cooksLast30,
    avgRating: avg(allStars),
    totalSpend: hasSpend ? totalSpendAllTime : null,
    avgKcal: avg(allKcal),
    avgMacros: { protein: avg(allProtein), carbs: avg(allCarbs), fat: avg(allFat) },
    trends: {
      cooks: computeTrend(cooksSeries),
      rating: computeTrend(ratingSeries),
      calories: computeTrend(kcalSeries),
      spend: computeTrend(spendSeries),
    },
    cooksPerWeek: weekKeys.map((weekStart) => ({ weekStart, cooks: cooksPerWeekMap.get(weekStart) ?? 0 })),
    ratingDrift: weekKeys.map((weekStart) => ({ weekStart, avgStars: avg(starsPerWeek.get(weekStart) ?? []) })),
    proteinDistribution: [...proteinCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count),
    tagDistribution: [...tagCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    nutritionPerWeek: weekKeys.map((weekStart) => ({
      weekStart,
      avgKcal: avg(kcalPerWeek.get(weekStart) ?? []),
      avgProtein: avg(proteinPerWeek.get(weekStart) ?? []),
      avgCarbs: avg(carbsPerWeek.get(weekStart) ?? []),
      avgFat: avg(fatPerWeek.get(weekStart) ?? []),
    })),
    spendPerWeek: weekKeys.map((weekStart) => ({
      weekStart,
      totalSpend: (costPerServingPerWeek.get(weekStart) ?? []).length > 0 ? spendPerWeek.get(weekStart)! : null,
      avgCostPerServing: avg(costPerServingPerWeek.get(weekStart) ?? []),
    })),
  };
}
