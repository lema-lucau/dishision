// §7.2: the propose_recipe tool. Structured output comes through tool calling,
// never JSON-in-prose — far more reliable to parse. The model calls this when
// it has a candidate to show or update, and replies in plain text (no tool
// call) for a pure clarifying question.
//
// timeline_mode is deliberately absent (§7.2 note): like manual recipes it's
// derived by the app from the lanes/steps, not authored by the bot.
export const PROPOSE_RECIPE_TOOL = {
  name: 'propose_recipe',
  description:
    'Propose or update the current best-guess recipe based on the conversation so far. Call this whenever you have enough information to produce a recipe, or when the user has asked for a change and you\'re supplying the updated version. Do not call this if you are only asking a clarifying question with nothing to show yet.',
  input_schema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description:
          'A short, appetizing, relevant name for the recipe. Always provide one, even as a first draft — the user can rename it later.',
      },
      description: { type: 'string' },
      base_servings: { type: 'integer' },
      photo_emoji: { type: 'string', description: 'A single emoji that fits the dish.' },
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            display_name: { type: 'string' },
            quantity: { type: 'number' },
            unit: { type: 'string' },
            scalable: { type: 'boolean' },
            optional: { type: 'boolean' },
          },
          required: ['display_name'],
        },
      },
      lanes: {
        type: 'array',
        description:
          "Steps grouped into lanes. Use a single lane named 'Main' unless the lane-splitting guidance in the system prompt calls for more.",
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  instruction: { type: 'string' },
                  phase: { type: 'string' },
                  effort: { type: 'string', enum: ['low', 'medium', 'high'] },
                  important: { type: 'boolean' },
                  duration_seconds: { type: ['integer', 'null'] },
                },
                required: ['instruction'],
              },
            },
          },
          required: ['name', 'steps'],
        },
      },
    },
    required: ['name', 'ingredients', 'lanes'],
  },
} as const;
