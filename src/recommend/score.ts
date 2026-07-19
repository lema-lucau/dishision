// §6.1 recommendation score, §6.5 degradation, §6.6 cold start. Pure
// functions only — no DB access, so the whole scoring model is unit-testable
// without a database (§11.2).
import type { RecommendationWeights } from '../settings/getSetting';

export interface ScoreInput {
  /** null = never cooked (§6.6 cold start). */
  daysSinceLastCooked: number | null;
  /** 1..5, null = unrated. */
  avgRating: number | null;
  timesCooked: number;
  /** Max times_cooked across the whole library — the frequency_norm denominator. */
  maxTimesCooked: number;
}

// recency_norm = min(days_since_last_cooked / 60, 1.0); never-cooked = 0.7
export function recencyNorm(daysSinceLastCooked: number | null): number {
  if (daysSinceLastCooked == null) return 0.7;
  return Math.min(daysSinceLastCooked / 60, 1.0);
}

// rating_norm = (avg_stars - 1) / 4; unrated = 0.5
export function ratingNorm(avgRating: number | null): number {
  if (avgRating == null) return 0.5;
  return (avgRating - 1) / 4;
}

// frequency_norm = times_cooked / max(times_cooked across library)
export function frequencyNorm(timesCooked: number, maxTimesCooked: number): number {
  if (maxTimesCooked <= 0) return 0;
  return timesCooked / maxTimesCooked;
}

// §6.5: when ratings are sparse (< 30% of recipes rated), w_rating collapses
// to 0 and its weight redistributes proportionally across recency and
// frequency — jitter is untouched. Multiplying the surviving two weights by
// (sum of all three) / (sum of the two) achieves exactly that redistribution.
export function effectiveWeights(weights: RecommendationWeights, ratedFraction: number): RecommendationWeights {
  if (ratedFraction >= 0.3) return weights;
  const { wRecency, wRating, wFrequency, wJitter } = weights;
  const recFreqSum = wRecency + wFrequency;
  if (recFreqSum <= 0) return { ...weights, wRating: 0 };
  const scale = (wRecency + wRating + wFrequency) / recFreqSum;
  return { wRecency: wRecency * scale, wRating: 0, wFrequency: wFrequency * scale, wJitter };
}

// score = w_recency*recency_norm + w_rating*rating_norm + w_frequency*frequency_norm + w_jitter*random()
// `jitter` is injected (rather than called internally) so scoring stays pure and testable.
export function scoreRecipe(input: ScoreInput, weights: RecommendationWeights, jitter: number): number {
  return (
    weights.wRecency * recencyNorm(input.daysSinceLastCooked) +
    weights.wRating * ratingNorm(input.avgRating) +
    weights.wFrequency * frequencyNorm(input.timesCooked, input.maxTimesCooked) +
    weights.wJitter * jitter
  );
}
