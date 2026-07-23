// §7.1 payload: the shareable, objective slice of a recipe. Never includes
// ratings, logs, favourites, cook counts, plans, or pantry state — the
// private/objective split (§1.1) drawn at the type level, not just by
// convention at each call site.
import type { DbClient } from '../db/DbClient';
import type { Effort, Phase, RecipeUnit, TimelineMode } from '../seed/types';

export const PAYLOAD_VERSION = 1;

export interface PayloadIngredient {
  display_name: string;
  canonical_name: string;
  quantity: number;
  unit: RecipeUnit;
  scalable: boolean;
  optional: boolean;
}

export interface PayloadLane {
  name: string;
  sort_order: number;
}

export interface PayloadStep {
  lane: string | null;
  phase: Phase;
  instruction: string;
  duration_seconds: number | null;
  start_offset_seconds: number;
  effort: Effort;
  important: boolean;
}

export interface SharePayload {
  v: number;
  share_id: string;
  recipe: {
    name: string;
    description: string | null;
    base_servings: number;
    timeline_mode: TimelineMode;
    origin_label: string | null;
    origin_url: string | null;
    /** base64 JPEG, opt-in at share time (§7.2). Always absent unless the sender chose to include it. */
    photo: string | null;
    photo_emoji: string;
  };
  ingredients: PayloadIngredient[];
  lanes: PayloadLane[];
  steps: PayloadStep[];
  tags: string[];
}

export class PayloadValidationError extends Error {}

interface BuildPayloadOptions {
  includePhoto?: boolean;
  /** Injected for testability — real callers default to the §8-pipeline file reader (sharing/photoBase64.ts). */
  readPhotoAsBase64?: (uri: string) => Promise<string>;
}

interface RecipeRow {
  share_id: string;
  name: string;
  description: string | null;
  photo_uri: string | null;
  photo_emoji: string;
  base_servings: number;
  timeline_mode: TimelineMode;
  origin_label: string | null;
  origin_url: string | null;
}

export async function buildSharePayload(
  db: DbClient,
  recipeId: number,
  options: BuildPayloadOptions = {},
): Promise<SharePayload> {
  const recipe = await db.getFirstAsync<RecipeRow>(
    `SELECT share_id, name, description, photo_uri, photo_emoji, base_servings, timeline_mode, origin_label, origin_url
     FROM recipe WHERE id = ?`,
    [recipeId],
  );
  if (!recipe) throw new Error(`Recipe ${recipeId} not found`);

  const laneRows = await db.getAllAsync<{ name: string; sort_order: number }>(
    'SELECT name, sort_order FROM step_lane WHERE recipe_id = ? ORDER BY sort_order',
    [recipeId],
  );

  const ingredientRows = await db.getAllAsync<{
    display_name: string;
    canonical_name: string | null;
    quantity: number;
    unit: RecipeUnit;
    scalable: number;
    optional: number;
  }>(
    `SELECT ri.display_name, ci.name as canonical_name, ri.quantity, ri.unit, ri.scalable, ri.optional
     FROM recipe_ingredient ri LEFT JOIN canonical_ingredient ci ON ci.id = ri.canonical_id
     WHERE ri.recipe_id = ? ORDER BY ri.sort_order`,
    [recipeId],
  );

  const stepRows = await db.getAllAsync<{
    lane_name: string | null;
    phase: Phase;
    instruction: string;
    duration_seconds: number | null;
    start_offset_seconds: number;
    effort: Effort;
    important: number;
  }>(
    `SELECT sl.name as lane_name, rs.phase, rs.instruction, rs.duration_seconds, rs.start_offset_seconds, rs.effort, rs.important
     FROM recipe_step rs LEFT JOIN step_lane sl ON sl.id = rs.lane_id
     WHERE rs.recipe_id = ? ORDER BY rs.sort_order`,
    [recipeId],
  );

  const tagRows = await db.getAllAsync<{ name: string }>(
    'SELECT t.name FROM recipe_tag rt JOIN tag t ON t.id = rt.tag_id WHERE rt.recipe_id = ? ORDER BY t.name',
    [recipeId],
  );

  let photo: string | null = null;
  if (options.includePhoto && recipe.photo_uri) {
    const reader = options.readPhotoAsBase64 ?? (await import('./photoBase64')).readPhotoAsBase64;
    photo = await reader(recipe.photo_uri);
  }

  return {
    v: PAYLOAD_VERSION,
    share_id: recipe.share_id,
    recipe: {
      name: recipe.name,
      description: recipe.description,
      base_servings: recipe.base_servings,
      timeline_mode: recipe.timeline_mode,
      origin_label: recipe.origin_label,
      origin_url: recipe.origin_url,
      photo,
      photo_emoji: recipe.photo_emoji,
    },
    ingredients: ingredientRows.map((i) => ({
      display_name: i.display_name,
      canonical_name: i.canonical_name ?? i.display_name,
      quantity: i.quantity,
      unit: i.unit,
      scalable: i.scalable === 1,
      optional: i.optional === 1,
    })),
    lanes: laneRows.map((l) => ({ name: l.name, sort_order: l.sort_order })),
    steps: stepRows.map((s) => ({
      lane: s.lane_name,
      phase: s.phase,
      instruction: s.instruction,
      duration_seconds: s.duration_seconds,
      start_offset_seconds: s.start_offset_seconds,
      effort: s.effort,
      important: s.important === 1,
    })),
    tags: tagRows.map((t) => t.name),
  };
}

export function serializeSharePayload(payload: SharePayload): string {
  return JSON.stringify(payload);
}

// §7.3: "Parse and validate against v" — never write silently, so parsing
// is strict about shape and throws PayloadValidationError (never crashes
// on malformed/foreign input, never half-parses).
export function parseSharePayload(json: string): SharePayload {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new PayloadValidationError('Not valid JSON');
  }
  if (typeof data !== 'object' || data === null) {
    throw new PayloadValidationError('Payload is not an object');
  }
  const candidate = data as Partial<SharePayload>;
  if (candidate.v !== PAYLOAD_VERSION) {
    throw new PayloadValidationError(`Unsupported payload version: ${String(candidate.v)}`);
  }
  if (typeof candidate.share_id !== 'string' || !candidate.share_id) {
    throw new PayloadValidationError('Missing share_id');
  }
  if (!candidate.recipe || typeof candidate.recipe.name !== 'string' || !candidate.recipe.name) {
    throw new PayloadValidationError('Missing recipe.name');
  }
  if (!Array.isArray(candidate.ingredients) || !Array.isArray(candidate.steps)) {
    throw new PayloadValidationError('Malformed ingredients/steps');
  }
  return {
    v: candidate.v,
    share_id: candidate.share_id,
    recipe: {
      name: candidate.recipe.name,
      description: candidate.recipe.description ?? null,
      base_servings: candidate.recipe.base_servings ?? 2,
      timeline_mode: candidate.recipe.timeline_mode ?? 'sequential',
      origin_label: candidate.recipe.origin_label ?? null,
      origin_url: candidate.recipe.origin_url ?? null,
      photo: candidate.recipe.photo ?? null,
      photo_emoji: candidate.recipe.photo_emoji ?? '🍽️',
    },
    ingredients: candidate.ingredients as PayloadIngredient[],
    lanes: Array.isArray(candidate.lanes) ? (candidate.lanes as PayloadLane[]) : [],
    steps: candidate.steps as PayloadStep[],
    tags: Array.isArray(candidate.tags) ? candidate.tags : [],
  };
}
