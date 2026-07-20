// §6.4 diversity rule: "The three shown picks must differ from each other on
// protein tag OR duration bucket. Three chicken dishes is the indecision
// problem restated, not solved." That worked example is the load-bearing
// bit — a same-protein trio must never survive even when their durations
// happen to differ, so two candidates conflict when EITHER dimension
// matches (compatible only if they differ on both). Untagged recipes (no
// protein tag) never conflict with each other on protein — there's no
// signal to compare.
import { recipePrimaryProtein, type EnrichedRecipe } from '../recipes/loadRecipes';

function conflicts(a: EnrichedRecipe, b: EnrichedRecipe): boolean {
  const proteinA = recipePrimaryProtein(a);
  const proteinB = recipePrimaryProtein(b);
  const sameProtein = proteinA != null && proteinB != null && proteinA === proteinB;
  const sameDuration = a.durationBucket === b.durationBucket;
  return sameProtein || sameDuration;
}

// Greedily walks the pre-sorted (by score) candidate list, taking the next
// recipe that doesn't conflict with anything already picked. If the pool is
// too homogeneous to fill every slot without a conflict, backfills from the
// remaining top-scored candidates rather than showing fewer than available —
// diversity is a preference layered on top of ranking, not a hard filter.
export function pickDiverse(sortedByScore: EnrichedRecipe[], count = 3): EnrichedRecipe[] {
  const picked: EnrichedRecipe[] = [];

  for (const candidate of sortedByScore) {
    if (picked.length >= count) break;
    if (picked.every((p) => !conflicts(p, candidate))) picked.push(candidate);
  }

  if (picked.length < count) {
    for (const candidate of sortedByScore) {
      if (picked.length >= count) break;
      if (!picked.includes(candidate)) picked.push(candidate);
    }
  }

  return picked;
}
