// The line that lands under a "Decide for us" reveal (product review §2). The
// engine already knows why a dish is a good idea; this dramatises that into one
// honest sentence — "you haven't had fish in 12 days, and you have everything
// for this". Pure and RN-free so the phrasing is unit-testable.
import { recipePrimaryProtein, type EnrichedRecipe } from '../recipes/loadRecipes';

const DAY_MS = 86_400_000;

function daysSince(iso: string | null, now: number): number | null {
  if (iso == null) return null;
  return Math.floor((now - new Date(iso).getTime()) / DAY_MS);
}

// Most recent cook of each primary protein across the whole library — lets the
// reason say "you haven't had fish in a while" using real dates, not a guess.
function lastCookedByProtein(recipes: EnrichedRecipe[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of recipes) {
    const protein = recipePrimaryProtein(r);
    if (protein == null || r.lastCookedAt == null) continue;
    const current = map.get(protein);
    if (current == null || r.lastCookedAt > current) map.set(protein, r.lastCookedAt);
  }
  return map;
}

export function decideReason(recipe: EnrichedRecipe, allRecipes: EnrichedRecipe[], now: number = Date.now()): string {
  const clauses: string[] = [];

  const nonOptional = recipe.ingredients.filter((i) => !i.optional);
  const pantryReady = nonOptional.length > 0 && nonOptional.every((i) => i.inPantry);

  // Protein gap — the most "it noticed something" clause, so it leads.
  const protein = recipePrimaryProtein(recipe);
  if (protein) {
    const lastProtein = daysSince(lastCookedByProtein(allRecipes).get(protein) ?? null, now);
    if (lastProtein == null) clauses.push(`you haven't had ${protein} in a while`);
    else if (lastProtein >= 7) clauses.push(`you haven't had ${protein} in ${lastProtein} days`);
  }

  if (clauses.length === 0) {
    const lastThis = daysSince(recipe.lastCookedAt, now);
    if (lastThis == null) clauses.push("you've never made this");
    else if (lastThis >= 14) clauses.push(`it's been ${lastThis} days since you last made it`);
    else if (recipe.avgRating != null && recipe.avgRating >= 4) clauses.push(`you rated it ${recipe.avgRating.toFixed(1)}★`);
  }

  if (pantryReady) clauses.push('you have everything for this');

  // Never return nothing — a reveal with no reason underneath is the flat card
  // this feature exists to avoid.
  if (clauses.length === 0) {
    if (recipe.costPerServing != null) clauses.push(`it's about ${recipe.costPerServing.toFixed(2)} a serving`);
    else clauses.push('it fits tonight');
  }

  const sentence = clauses.slice(0, 2).join(', and ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
}

// The eligible pool for a decisive roll: everything not excluded, so the pick
// can genuinely surprise rather than re-offer the three cards already on Home.
export function decidablePool(recipes: EnrichedRecipe[]): EnrichedRecipe[] {
  return recipes.filter((r) => r.exclusion == null && r.steps.length > 0);
}
