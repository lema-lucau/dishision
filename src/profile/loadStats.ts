// §5.10 / batch-2 F1 Stats: counts, trends, nutrition, and money — every figure
// derived from cook_log at read time (§2.5), nothing stored. A single WINDOW
// (1d/7d/14d/30d/90d/All) drives the whole page: headline figures are computed
// within it, and the series bucket adaptively (per-day ≤14d, per-week otherwise).
// Reuses loadEnrichedRecipes for per-serving macro/cost derivation.
import type { DbClient } from '../db/DbClient';
import { loadEnrichedRecipes, recipePrimaryProtein } from '../recipes/loadRecipes';
import { localDateKey } from '../lib/formatDate';
import { bucketize, granularityForWindow, windowStartKey, type Bucket, type Granularity } from './bucketize';

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
  /** The window these figures were computed over (null = all time). */
  windowDays: number | null;
  granularity: Granularity;
  totalCooks: number;
  distinctRecipesCooked: number;
  mostCooked: { recipeId: number; name: string; count: number } | null;
  /** Distinct calendar days cooked within the window. */
  cookedDaysInWindow: number;
  /** Average star rating across rated cooks in the window. */
  avgRating: number | null;
  /** Total spend (cost per serving × servings made) across cooks with a known cost, in the window. */
  totalSpend: number | null;
  /** Average macros per serving across cooks with known macros, in the window. */
  avgKcal: number | null;
  avgMacros: { protein: number | null; carbs: number | null; fat: number | null };
  trends: { cooks: Trend; rating: Trend; calories: Trend; spend: Trend };
  /** Adaptive-granularity series for the four charts. */
  series: { cooks: Bucket[]; rating: Bucket[]; calories: Bucket[]; spend: Bucket[] };
  proteinDistribution: TagDistributionEntry[];
  tagDistribution: TagDistributionEntry[];
}

export interface LoadStatsOptions {
  /** Days back from `now`; null = all time. */
  windowDays?: number | null;
  now?: Date;
}

// Recent-half vs previous-half comparison of a series (nulls ignored).
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

interface CookLogRow {
  id: number;
  recipe_id: number;
  cooked_at: string;
  servings_made: number;
  stars: number | null;
}

/** One cook, enriched with the derived per-serving numbers the charts need. */
interface EnrichedLog {
  dateKey: string;
  cookedAtMs: number;
  recipeId: number;
  stars: number | null;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  costPerServing: number | null;
  spend: number | null; // costPerServing × servingsMade
}

const avg = (values: number[]): number | null => (values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length);

export async function loadStats(db: DbClient, options: LoadStatsOptions = {}): Promise<Stats> {
  // Distinguish an explicit null (all time) from an omitted option (default 30).
  const windowDays = options.windowDays === undefined ? 30 : options.windowDays;
  const now = options.now ?? new Date();

  const rows = await db.getAllAsync<CookLogRow>(
    `SELECT id, recipe_id, cooked_at, servings_made, stars FROM cook_log WHERE completed = 1 ORDER BY cooked_at`,
  );
  const recipes = await loadEnrichedRecipes(db);
  const recipeById = new Map(recipes.map((r) => [r.id, r]));

  // Only cooks inside the window feed every figure on the page (§F1.2).
  const startKey = windowStartKey(windowDays, now); // null = all time
  const inWindow = (row: CookLogRow) => startKey == null || row.cooked_at.slice(0, 10) >= startKey;

  const logs: EnrichedLog[] = rows
    .filter(inWindow)
    .map((row) => {
      const recipe = recipeById.get(row.recipe_id);
      const costPerServing = recipe?.costPerServing ?? null;
      return {
        dateKey: row.cooked_at.slice(0, 10),
        cookedAtMs: new Date(row.cooked_at).getTime(),
        recipeId: row.recipe_id,
        stars: row.stars,
        kcal: recipe?.kcalPerServing ?? null,
        protein: recipe?.proteinPerServing ?? null,
        carbs: recipe?.carbsPerServing ?? null,
        fat: recipe?.fatPerServing ?? null,
        costPerServing,
        spend: costPerServing != null ? costPerServing * row.servings_made : null,
      };
    });

  const totalCooks = logs.length;
  const distinctRecipesCooked = new Set(logs.map((l) => l.recipeId)).size;
  const cookedDaysInWindow = new Set(logs.map((l) => l.dateKey)).size;

  const countByRecipe = new Map<number, number>();
  for (const l of logs) countByRecipe.set(l.recipeId, (countByRecipe.get(l.recipeId) ?? 0) + 1);
  let mostCooked: Stats['mostCooked'] = null;
  for (const [recipeId, count] of countByRecipe) {
    if (!mostCooked || count > mostCooked.count) {
      mostCooked = { recipeId, name: recipeById.get(recipeId)?.name ?? 'Unknown recipe', count };
    }
  }

  const stars = logs.map((l) => l.stars).filter((v): v is number => v != null);
  const kcal = logs.map((l) => l.kcal).filter((v): v is number => v != null);
  const protein = logs.map((l) => l.protein).filter((v): v is number => v != null);
  const carbs = logs.map((l) => l.carbs).filter((v): v is number => v != null);
  const fat = logs.map((l) => l.fat).filter((v): v is number => v != null);
  const spends = logs.map((l) => l.spend).filter((v): v is number => v != null);

  const proteinCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  for (const l of logs) {
    const recipe = recipeById.get(l.recipeId);
    if (!recipe) continue;
    const p = recipePrimaryProtein(recipe);
    if (p) proteinCounts.set(p, (proteinCounts.get(p) ?? 0) + 1);
    for (const tag of recipe.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }

  // Adaptive series over the window (per-day ≤14d, per-week otherwise).
  const series = {
    cooks: bucketize({ items: logs, windowDays, now, dateOf: (l) => l.dateKey, valueOf: () => 1, aggregate: 'sum', emptyValue: 0 }),
    rating: bucketize({ items: logs, windowDays, now, dateOf: (l) => l.dateKey, valueOf: (l) => l.stars, aggregate: 'avg' }),
    calories: bucketize({ items: logs, windowDays, now, dateOf: (l) => l.dateKey, valueOf: (l) => l.kcal, aggregate: 'avg' }),
    spend: bucketize({ items: logs, windowDays, now, dateOf: (l) => l.dateKey, valueOf: (l) => l.spend, aggregate: 'sum' }),
  };

  return {
    windowDays,
    granularity: granularityForWindow(windowDays),
    totalCooks,
    distinctRecipesCooked,
    mostCooked,
    cookedDaysInWindow,
    avgRating: avg(stars),
    totalSpend: spends.length > 0 ? spends.reduce((a, b) => a + b, 0) : null,
    avgKcal: avg(kcal),
    avgMacros: { protein: avg(protein), carbs: avg(carbs), fat: avg(fat) },
    trends: {
      cooks: computeTrend(series.cooks.map((b) => b.value)),
      rating: computeTrend(series.rating.map((b) => b.value)),
      calories: computeTrend(series.calories.map((b) => b.value)),
      spend: computeTrend(series.spend.map((b) => b.value)),
    },
    series,
    proteinDistribution: [...proteinCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count),
    tagDistribution: [...tagCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  };
}
