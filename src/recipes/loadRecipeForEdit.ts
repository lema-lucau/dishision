// Loads one recipe's full editable shape (lanes + steps + ingredient
// canonical names + tags) for the recipe form (§5.5). loadRecipes.ts covers
// the read/list/detail path; this is the write-path counterpart.
import type { DbClient } from '../db/DbClient';
import type { RecipeDraft } from './recipeSave';

export async function loadRecipeDraft(db: DbClient, recipeId: number): Promise<RecipeDraft> {
  const recipe = await db.getFirstAsync<{
    name: string;
    description: string | null;
    photo_emoji: string;
    base_servings: number;
    timeline_mode: 'sequential' | 'parallel';
    origin_label: string | null;
  }>('SELECT name, description, photo_emoji, base_servings, timeline_mode, origin_label FROM recipe WHERE id = ?', [recipeId]);
  if (!recipe) throw new Error(`Recipe ${recipeId} not found`);

  const lanes = await db.getAllAsync<{ name: string }>(
    'SELECT name FROM step_lane WHERE recipe_id = ? ORDER BY sort_order',
    [recipeId],
  );
  const ingredients = await db.getAllAsync<{
    canonical_id: number | null;
    display_name: string;
    quantity: number;
    unit: string;
    scalable: number;
    optional: number;
  }>(
    'SELECT canonical_id, display_name, quantity, unit, scalable, optional FROM recipe_ingredient WHERE recipe_id = ? ORDER BY sort_order',
    [recipeId],
  );
  const steps = await db.getAllAsync<{
    lane_name: string | null;
    phase: 'prep' | 'cook';
    instruction: string;
    duration_seconds: number | null;
    start_offset_seconds: number;
    effort: 'active' | 'passive';
    important: number;
  }>(
    `SELECT sl.name as lane_name, rs.phase, rs.instruction, rs.duration_seconds, rs.start_offset_seconds, rs.effort, rs.important
     FROM recipe_step rs LEFT JOIN step_lane sl ON sl.id = rs.lane_id
     WHERE rs.recipe_id = ? ORDER BY rs.sort_order`,
    [recipeId],
  );
  const tags = await db.getAllAsync<{ name: string }>(
    'SELECT t.name FROM recipe_tag rt JOIN tag t ON t.id = rt.tag_id WHERE rt.recipe_id = ?',
    [recipeId],
  );

  return {
    name: recipe.name,
    description: recipe.description ?? '',
    photoEmoji: recipe.photo_emoji,
    baseServings: recipe.base_servings,
    timelineMode: recipe.timeline_mode,
    originLabel: recipe.origin_label ?? '',
    lanes: lanes.map((l) => l.name),
    ingredients: ingredients.map((i) => ({
      canonicalId: i.canonical_id,
      displayName: i.display_name,
      quantity: i.quantity,
      unit: i.unit as RecipeDraft['ingredients'][number]['unit'],
      scalable: i.scalable === 1,
      optional: i.optional === 1,
    })),
    steps: steps.map((s) => ({
      lane: s.lane_name ?? undefined,
      phase: s.phase,
      instruction: s.instruction,
      durationSeconds: s.duration_seconds ?? undefined,
      startOffsetSeconds: s.start_offset_seconds,
      effort: s.effort,
      important: s.important === 1,
    })),
    tags: tags.map((t) => t.name),
  };
}

export function emptyRecipeDraft(): RecipeDraft {
  return {
    name: '',
    description: '',
    photoEmoji: '🍽️',
    baseServings: 2,
    timelineMode: 'sequential',
    originLabel: '',
    lanes: [],
    ingredients: [],
    steps: [],
    tags: [],
  };
}
