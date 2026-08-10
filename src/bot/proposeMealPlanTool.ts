// §A2.5 / batch-2 E Weekly Planning: the propose_meal_plan tool. The bot returns
// an ORDERED list of fresh dinners to cook — each either a saved recipe id or a
// new recipe name, with a one-line reason. It does NOT assign dates or mark
// leftover days: the app schedules leftover days deterministically between the
// cooks from batch/household size (see plan/leftoverPlanner.ts).
export const PROPOSE_MEAL_PLAN_TOOL = {
  name: 'propose_meal_plan',
  description:
    'Propose an ORDERED list of fresh dinners to cook across the planning span. The app schedules leftover days between them automatically from batch size, so do NOT assign dates or mark leftover days yourself — just return the cooks in the order they should happen. Prefer existing saved recipes where they fit; only name a new recipe where nothing suitable exists. Provide enough cooks to fill the span in the worst case (up to one per day); the app stops early once coverage is reached.',
  input_schema: {
    type: 'object',
    properties: {
      cooks: {
        type: 'array',
        description: 'Ordered fresh dinners to cook. The app inserts leftover days between them.',
        items: {
          type: 'object',
          properties: {
            existing_recipe_id: {
              type: ['integer', 'null'],
              description: 'Reference a saved recipe by id where one fits.',
            },
            new_recipe_name: { type: ['string', 'null'], description: 'Only if proposing something not already saved.' },
            reasoning: {
              type: 'string',
              description: 'One short line on why this fits — haven\'t cooked in a while, quick on a busy day, uses the pantry, etc.',
            },
          },
        },
      },
      notes: { type: 'string' },
    },
    required: ['cooks'],
  },
} as const;

export interface ProposedCook {
  existing_recipe_id?: number | null;
  new_recipe_name?: string | null;
  reasoning?: string;
}

export interface ProposedMealPlan {
  cooks: ProposedCook[];
  notes?: string;
}

// Normalise a raw propose_meal_plan tool input into a clean ordered cook list,
// dropping malformed entries (a cook must point somewhere — an id or a name).
export function parseMealPlan(input: unknown): ProposedMealPlan | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as { cooks?: unknown; notes?: unknown };
  if (!Array.isArray(raw.cooks)) return null;
  const cooks: ProposedCook[] = [];
  for (const c of raw.cooks) {
    if (!c || typeof c !== 'object') continue;
    const cook = c as { existing_recipe_id?: unknown; new_recipe_name?: unknown; reasoning?: unknown };
    const existingId = typeof cook.existing_recipe_id === 'number' ? cook.existing_recipe_id : null;
    const newName = typeof cook.new_recipe_name === 'string' && cook.new_recipe_name.trim() ? cook.new_recipe_name.trim() : null;
    if (existingId == null && newName == null) continue;
    cooks.push({
      existing_recipe_id: existingId,
      new_recipe_name: newName,
      reasoning: typeof cook.reasoning === 'string' ? cook.reasoning : undefined,
    });
  }
  if (cooks.length === 0) return null;
  return { cooks, notes: typeof raw.notes === 'string' ? raw.notes : undefined };
}
