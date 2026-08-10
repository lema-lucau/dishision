// §E (batch-2) deterministic leftover layout. The bot only chooses WHICH recipes
// to cook, in order; the app decides the cook-vs-leftover pattern exactly, from
// batch size and household size. A cook that yields `servingsMade` total feeds
// `max(1, floor(servingsMade / householdSize))` meals — it occupies its cook day
// plus that many minus one leftover days. Gap days auto-fill as leftovers of the
// preceding cook. Pure so the arithmetic is fully unit-tested.

/** A single fresh cook the bot picked — either a saved recipe id or a new name. */
export interface PlannerCook {
  existing_recipe_id?: number | null;
  new_recipe_name?: string | null;
  reasoning?: string;
}

export type PlannedDay<C = PlannerCook> =
  | { date: string; kind: 'cook'; cook: C }
  | { date: string; kind: 'leftover'; sourceCook: C };

export interface LayoutArgs<C> {
  /** Ordered fresh cooks the bot proposed. */
  cooks: C[];
  /** First calendar day of the span (YYYY-MM-DD). */
  startDate: string;
  /** Number of calendar days to fill from `startDate`. */
  spanDays: number;
  /** People the batch is divided across (≥1). */
  householdSize: number;
  /** Total servings a given cook yields. */
  servingsOf: (cook: C) => number;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** How many meals a cook covers: at least its own day; more when the batch
 *  feeds the household on following days too. */
export function mealsCovered(servingsMade: number, householdSize: number): number {
  const size = Math.max(1, householdSize);
  return Math.max(1, Math.floor((servingsMade || 0) / size));
}

/** Lay the ordered cooks across `spanDays`, inserting leftover days between them.
 *  Stops early once the span is covered; if the cooks run out first, the
 *  remaining days stay unfilled (the UI shows them as "needs a cook"). */
export function layoutLeftoverPlan<C = PlannerCook>({
  cooks,
  startDate,
  spanDays,
  householdSize,
  servingsOf,
}: LayoutArgs<C>): PlannedDay<C>[] {
  const days: PlannedDay<C>[] = [];
  let cursor = 0;
  let i = 0;
  while (cursor < spanDays && i < cooks.length) {
    const cook = cooks[i];
    i += 1;
    days.push({ date: addDays(startDate, cursor), kind: 'cook', cook });
    const meals = mealsCovered(servingsOf(cook), householdSize);
    for (let k = 1; k < meals; k += 1) {
      if (cursor + k >= spanDays) break;
      days.push({ date: addDays(startDate, cursor + k), kind: 'leftover', sourceCook: cook });
    }
    cursor += meals;
  }
  return days;
}
