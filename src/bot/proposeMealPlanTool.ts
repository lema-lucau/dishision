// §A2.5 Weekly Planning: the propose_meal_plan tool. The bot returns a set of
// day-slot assignments, each either referencing an existing saved recipe by id
// or naming a new one to create, with a one-line reason. Unlike propose_recipe
// this doesn't build a recipe — it arranges the week.
export const PROPOSE_MEAL_PLAN_TOOL = {
  name: 'propose_meal_plan',
  description:
    'Propose a set of meals for the requested days. Prefer existing saved recipes where they fit; only propose a new recipe where nothing suitable exists. Space cooks out across the week: mark days that live off a previous cook\'s leftovers with is_leftover so you are not scheduling a cook every day.',
  input_schema: {
    type: 'object',
    properties: {
      days: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'ISO date (YYYY-MM-DD)' },
            is_leftover: {
              type: ['boolean', 'null'],
              description:
                'True for a leftover day — no new cook. Point existing_recipe_id at the recipe the leftovers come from. Requires no new_recipe_name.',
            },
            existing_recipe_id: {
              type: ['integer', 'null'],
              description: 'Reference a saved recipe by id where one fits (required for a leftover day: the source recipe).',
            },
            new_recipe_name: { type: ['string', 'null'], description: 'Only if proposing something not already saved.' },
            reasoning: {
              type: 'string',
              description: 'One short line on why this fits — uses up leftovers, haven\'t cooked in a while, quick on a busy day, etc.',
            },
          },
          required: ['date'],
        },
      },
      notes: { type: 'string' },
    },
    required: ['days'],
  },
} as const;

export interface ProposedMealPlanDay {
  date: string;
  /** §J: a leftover day — no new cook; existing_recipe_id names the source. */
  isLeftover?: boolean;
  existing_recipe_id?: number | null;
  new_recipe_name?: string | null;
  reasoning?: string;
}

export interface ProposedMealPlan {
  days: ProposedMealPlanDay[];
  notes?: string;
}

// Normalise a raw propose_meal_plan tool input into a clean plan, dropping
// malformed days and coercing types.
export function parseMealPlan(input: unknown): ProposedMealPlan | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as { days?: unknown; notes?: unknown };
  if (!Array.isArray(raw.days)) return null;
  const days: ProposedMealPlanDay[] = [];
  for (const d of raw.days) {
    if (!d || typeof d !== 'object') continue;
    const day = d as { date?: unknown; is_leftover?: unknown; existing_recipe_id?: unknown; new_recipe_name?: unknown; reasoning?: unknown };
    if (typeof day.date !== 'string' || !day.date.trim()) continue;
    const existingId = typeof day.existing_recipe_id === 'number' ? day.existing_recipe_id : null;
    const newName = typeof day.new_recipe_name === 'string' && day.new_recipe_name.trim() ? day.new_recipe_name.trim() : null;
    const isLeftover = day.is_leftover === true;
    // A cook day needs to point somewhere; a leftover day must name its source
    // recipe (existing_recipe_id) and never carries a new recipe.
    if (isLeftover) {
      if (existingId == null) continue;
    } else if (existingId == null && newName == null) {
      continue;
    }
    days.push({
      date: day.date.slice(0, 10),
      isLeftover,
      existing_recipe_id: existingId,
      new_recipe_name: isLeftover ? null : newName,
      reasoning: typeof day.reasoning === 'string' ? day.reasoning : undefined,
    });
  }
  if (days.length === 0) return null;
  return { days, notes: typeof raw.notes === 'string' ? raw.notes : undefined };
}
