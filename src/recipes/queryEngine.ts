// One filter/sort/search engine, two entry points (§5.3): the Recipes tab
// filter bar and the "I'm feeling…" picker both compile chip selections
// into the same predicate set over the same enriched recipe list.
import type { EnrichedRecipe } from './loadRecipes';

export type ChipKey =
  | 'quick'
  | 'healthy'
  | 'comfort'
  | 'highProtein'
  | 'lowKcal'
  | 'chicken'
  | 'beef'
  | 'pork'
  | 'lamb'
  | 'fish'
  | 'veg'
  | 'cheap'
  | 'usesWhatIHave'
  | 'lowEffort';

/** Chips collapsed under the expandable "Protein" group in the filter bar (§5.3 UI). */
export const PROTEIN_GROUP_CHIPS: ChipKey[] = ['chicken', 'beef', 'pork', 'lamb', 'fish'];

const LOW_KCAL_THRESHOLD = 500;

export type SortKey =
  | 'name'
  | 'rating'
  | 'timesCooked'
  | 'lastCooked'
  | 'totalTime'
  | 'handsOnTime'
  | 'costPerServing'
  | 'calories'
  | 'dateAdded';

export type SortDirection = 'asc' | 'desc';

export interface RecipeQuery {
  search?: string;
  chips: ChipKey[];
  tagNames?: string[];
  sort: SortKey;
  direction?: SortDirection;
  /** Exclude never_again / active not_tonight rows (§6.2). On by default for the Recipes tab and the picker; off for e.g. an exclusions-management view. */
  applyExclusions?: boolean;
  /**
   * Backfill to 3 from the boost pool when chip filtering yields fewer than
   * 3 (§5.3). This is a picker-only behaviour — the Recipes tab filter is a
   * hard filter and should show every match, however many (including
   * zero), never silently padding the list with non-matches.
   */
  relax?: boolean;
}

export interface ChipAvailability {
  enabled: boolean;
  reason?: string;
}

const PROTEIN_CHIPS: ChipKey[] = ['chicken', 'beef', 'pork', 'lamb', 'fish', 'veg'];
const DATA_GATED_THRESHOLD = 0.6;

function isExcludedNow(recipe: EnrichedRecipe, now: number): boolean {
  if (!recipe.exclusion) return false;
  if (recipe.exclusion.kind === 'never_again') return true;
  if (!recipe.exclusion.expiresAt) return false;
  return new Date(recipe.exclusion.expiresAt).getTime() > now;
}

// §5.3 chip predicates. `median` is the cached §6.8 median cost per serving.
function chipMatches(recipe: EnrichedRecipe, chip: ChipKey, median: number | null): boolean {
  switch (chip) {
    case 'quick':
      return recipe.totalSeconds < 20 * 60;
    case 'lowEffort':
      return recipe.activeSeconds < 15 * 60;
    case 'healthy':
      return recipe.tags.includes('healthy');
    case 'comfort':
      return recipe.tags.includes('comfort');
    case 'highProtein':
      return recipe.proteinPerServing != null && recipe.proteinPerServing >= 30;
    case 'lowKcal':
      return recipe.kcalPerServing != null && recipe.kcalPerServing < LOW_KCAL_THRESHOLD;
    case 'chicken':
    case 'beef':
    case 'pork':
    case 'lamb':
    case 'fish':
    case 'veg':
      return recipe.tags.includes(chip);
    case 'cheap':
      return recipe.costPerServing != null && median != null && recipe.costPerServing < median;
    case 'usesWhatIHave':
      return recipe.ingredients.filter((i) => !i.optional).every((i) => i.inPantry);
    default:
      return true;
  }
}

// A recipe's cost is only "complete" when every ingredient has one —
// partial figures are excluded from the median rather than dragging it
// down (§6.8).
export function computeMedianCostPerServing(recipes: EnrichedRecipe[]): number | null {
  const complete = recipes
    .filter((r) => r.costPerServing != null && r.costCompleteCount === r.totalIngredientCount && r.totalIngredientCount > 0)
    .map((r) => r.costPerServing as number)
    .sort((a, b) => a - b);
  if (complete.length === 0) return null;
  const mid = Math.floor(complete.length / 2);
  return complete.length % 2 !== 0 ? complete[mid] : (complete[mid - 1] + complete[mid]) / 2;
}

// §5.3: "a chip whose data is under-populated is greyed with a reason" —
// enabled once ≥60% of non-excluded recipes carry the data it needs.
export function computeChipAvailability(recipes: EnrichedRecipe[]): Record<ChipKey, ChipAvailability> {
  const total = recipes.length || 1;
  const costCoverage = recipes.filter((r) => r.costPerServing != null).length / total;
  const proteinCoverage = recipes.filter((r) => r.proteinPerServing != null).length / total;
  const kcalCoverage = recipes.filter((r) => r.kcalPerServing != null).length / total;
  const missingCost = recipes.length - recipes.filter((r) => r.costPerServing != null).length;
  const missingProtein = recipes.length - recipes.filter((r) => r.proteinPerServing != null).length;
  const missingKcal = recipes.length - recipes.filter((r) => r.kcalPerServing != null).length;

  const always: ChipAvailability = { enabled: true };
  return {
    quick: always,
    lowEffort: always,
    healthy: always,
    comfort: always,
    chicken: always,
    beef: always,
    pork: always,
    lamb: always,
    fish: always,
    veg: always,
    usesWhatIHave: always,
    cheap:
      costCoverage >= DATA_GATED_THRESHOLD
        ? always
        : { enabled: false, reason: `Add costs to ${missingCost} recipes first` },
    highProtein:
      proteinCoverage >= DATA_GATED_THRESHOLD
        ? always
        : { enabled: false, reason: `Add macros to ${missingProtein} recipes first` },
    lowKcal:
      kcalCoverage >= DATA_GATED_THRESHOLD
        ? always
        : { enabled: false, reason: `Add macros to ${missingKcal} recipes first` },
  };
}

function matchesSearch(recipe: EnrichedRecipe, search: string): { matched: boolean; matchedInNotes: boolean } {
  const needle = search.trim().toLowerCase();
  if (!needle) return { matched: true, matchedInNotes: false };

  const haystack = [recipe.name, recipe.description ?? '', ...recipe.ingredients.map((i) => i.displayName)]
    .join(' ')
    .toLowerCase();
  if (haystack.includes(needle)) return { matched: true, matchedInNotes: false };

  const noteHit = recipe.logNotes.some((n) => n.toLowerCase().includes(needle));
  return { matched: noteHit, matchedInNotes: noteHit };
}

export interface QueryResultItem {
  recipe: EnrichedRecipe;
  matchedInNotes: boolean;
}

export interface QueryResult {
  items: QueryResultItem[];
  chipAvailability: Record<ChipKey, ChipAvailability>;
  /** True when the result was backfilled from the boost pool because hard filtering yielded < 3 (§5.3). */
  relaxed: boolean;
}

function compareNullableLast<T>(a: T | null, b: T | null, direction: SortDirection, cmp: (a: T, b: T) => number): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const result = cmp(a, b);
  return direction === 'asc' ? result : -result;
}

function sortRecipes(recipes: EnrichedRecipe[], sort: SortKey, direction: SortDirection): EnrichedRecipe[] {
  const withKey = (r: EnrichedRecipe) => {
    switch (sort) {
      case 'name':
        return r.name.toLowerCase();
      case 'rating':
        return r.avgRating;
      case 'timesCooked':
        return r.timesCooked;
      case 'lastCooked':
        return r.lastCookedAt;
      case 'totalTime':
        return r.totalSeconds;
      case 'handsOnTime':
        return r.activeSeconds;
      case 'costPerServing':
        return r.costPerServing;
      case 'calories':
        return r.kcalPerServing;
      case 'dateAdded':
        return r.createdAt;
      default:
        return null;
    }
  };

  return [...recipes].sort((a, b) => {
    const ka = withKey(a);
    const kb = withKey(b);
    if (typeof ka === 'string' || typeof kb === 'string') {
      return compareNullableLast(ka as string | null, kb as string | null, direction, (x, y) => (x < y ? -1 : x > y ? 1 : 0));
    }
    return compareNullableLast(ka as number | null, kb as number | null, direction, (x, y) => x - y);
  });
}

// The shared engine (§5.3, §5.4): hard-filters by chips/tags/search/exclusions,
// relaxes to a boost-pool backfill when fewer than 3 chip matches survive,
// then sorts. `now` is injectable for tests.
export function runRecipeQuery(
  allRecipes: EnrichedRecipe[],
  query: RecipeQuery,
  now: number = Date.now(),
): QueryResult {
  const chipAvailability = computeChipAvailability(allRecipes);
  const median = computeMedianCostPerServing(allRecipes);
  const applyExclusions = query.applyExclusions ?? true;

  const base = applyExclusions ? allRecipes.filter((r) => !isExcludedNow(r, now)) : allRecipes;

  const withTags = query.tagNames?.length
    ? base.filter((r) => query.tagNames!.every((t) => r.tags.includes(t)))
    : base;

  const searched = withTags
    .map((r) => ({ recipe: r, search: matchesSearch(r, query.search ?? '') }))
    .filter((r) => r.search.matched);

  const activeChips = (query.chips ?? []).filter((c) => chipAvailability[c]?.enabled);
  const chipFiltered = searched.filter(({ recipe }) => activeChips.every((c) => chipMatches(recipe, c, median)));

  let relaxed = false;
  let resultSet = chipFiltered;
  if (query.relax && activeChips.length > 0 && chipFiltered.length < 3) {
    relaxed = true;
    const already = new Set(chipFiltered.map((r) => r.recipe.id));
    const backfill = searched.filter((r) => !already.has(r.recipe.id)).slice(0, 3 - chipFiltered.length);
    resultSet = [...chipFiltered, ...backfill];
  }

  const sorted = sortRecipes(
    resultSet.map((r) => r.recipe),
    query.sort,
    query.direction ?? 'asc',
  );
  const matchedInNotesById = new Map(resultSet.map((r) => [r.recipe.id, r.search.matchedInNotes]));

  return {
    items: sorted.map((recipe) => ({ recipe, matchedInNotes: matchedInNotesById.get(recipe.id) ?? false })),
    chipAvailability,
    relaxed,
  };
}

export function primaryProteinTag(tags: string[]): string | null {
  return PROTEIN_CHIPS.find((chip) => tags.includes(chip)) ?? null;
}
