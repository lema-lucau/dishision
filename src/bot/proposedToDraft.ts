// Convert a propose_recipe tool result (§7.2) into the app's RecipeDraft — the
// exact shape manual creation and import already produce (recipeSave.ts), so a
// bot-produced recipe flows through the identical Review → Save path.
//
// The pure mapping (proposedToDraft) leaves every canonical_id null; a separate
// DB pass (resolveDraftIngredients) does the §6 ingredient matching, since that
// needs the database and the "new ingredient" flagging.
import type { DbClient } from '../db/DbClient';
import { createUserIngredient } from '../recipes/ingredientSearch';
import { stripPrepDescriptors } from './ingredientNameNormalize';
import { resolveCanonicalIngredientId } from '../sharing/resolveCanonicalIngredient';
import type { RecipeDraft, RecipeIngredientDraft, RecipeStepDraft } from '../recipes/recipeSave';
import type { BaseUnit, Effort, Phase, RecipeUnit } from '../seed/types';
import type { ProposedRecipe, ProposedStep } from './types';

const RECIPE_UNITS: RecipeUnit[] = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'unit'];

// Normalise the tool's free-text unit onto the app's fixed RecipeUnit set.
// Anything unrecognised (a count, "piece", "clove", "pinch") folds to 'unit',
// matching the app's convention of carrying countables as a plain unit.
export function normalizeUnit(raw: string | undefined): RecipeUnit {
  if (!raw) return 'unit';
  const u = raw.trim().toLowerCase();
  if (RECIPE_UNITS.includes(u as RecipeUnit)) return u as RecipeUnit;
  const map: Record<string, RecipeUnit> = {
    gram: 'g', grams: 'g', gr: 'g', gs: 'g',
    kilogram: 'kg', kilograms: 'kg', kilo: 'kg', kilos: 'kg',
    milliliter: 'ml', millilitre: 'ml', milliliters: 'ml', millilitres: 'ml',
    liter: 'l', litre: 'l', liters: 'l', litres: 'l',
    teaspoon: 'tsp', teaspoons: 'tsp', tsps: 'tsp',
    tablespoon: 'tbsp', tablespoons: 'tbsp', tbsps: 'tbsp', tbs: 'tbsp',
    cups: 'cup',
    piece: 'unit', pieces: 'unit', pcs: 'unit', pc: 'unit',
    clove: 'unit', cloves: 'unit', whole: 'unit', count: 'unit', each: 'unit',
  };
  return map[u] ?? 'unit';
}

// The canonical base_unit to seed a newly auto-created ingredient with (§6),
// inferred from the recipe unit it first appears in.
export function baseUnitForRecipeUnit(unit: RecipeUnit): BaseUnit {
  if (unit === 'ml' || unit === 'l' || unit === 'tsp' || unit === 'tbsp' || unit === 'cup') return 'ml';
  if (unit === 'g' || unit === 'kg') return 'g';
  return 'unit';
}

// The tool reports effort as low/medium/high; the app models it as active vs
// passive (hands-on vs hands-off). Low effort maps to passive (simmering,
// resting, roasting unattended); medium/high to active.
function mapEffort(effort: ProposedStep['effort']): Effort {
  return effort === 'low' ? 'passive' : 'active';
}

// The tool's phase is free text; the app has just prep/cook. Anything that
// looks like preparation is 'prep', everything else 'cook' (the safer default,
// since a mis-tagged cook step is harmless where a mis-tagged prep step could
// mis-order the timeline).
function mapPhase(phase: string | undefined): Phase {
  if (phase && /prep|chop|mise|prepare|ready/i.test(phase)) return 'prep';
  return 'cook';
}

// Lanes with at least one step. A single lane (or a lone lane named "Main")
// means a plain sequential recipe; two or more real lanes means the bot split
// the work in parallel.
function realLanes(proposed: ProposedRecipe): ProposedRecipe['lanes'] {
  return proposed.lanes.filter((l) => Array.isArray(l.steps) && l.steps.length > 0);
}

export function proposedToDraft(proposed: ProposedRecipe): RecipeDraft {
  const lanes = realLanes(proposed);
  const isParallel = lanes.length > 1;

  const ingredients: RecipeIngredientDraft[] = (proposed.ingredients ?? []).map((ing) => {
    const unit = normalizeUnit(ing.unit);
    return {
      canonicalId: null,
      displayName: (ing.display_name ?? '').trim(),
      quantity: typeof ing.quantity === 'number' && Number.isFinite(ing.quantity) ? ing.quantity : 0,
      unit,
      scalable: ing.scalable ?? true,
      optional: ing.optional ?? false,
    };
  });

  const steps: RecipeStepDraft[] = [];
  for (const lane of lanes) {
    // Within a lane, steps run one after another. For a parallel recipe we
    // author each lane's start offsets as a running sum of its own durations
    // (the bot doesn't supply offsets); sequential recipes ignore the field
    // and re-derive it at read time (recipeSave.ts).
    let running = 0;
    for (const step of lane.steps) {
      const duration = typeof step.duration_seconds === 'number' && step.duration_seconds > 0 ? Math.round(step.duration_seconds) : undefined;
      steps.push({
        lane: isParallel ? lane.name : undefined,
        phase: mapPhase(step.phase),
        instruction: (step.instruction ?? '').trim(),
        durationSeconds: duration,
        startOffsetSeconds: isParallel ? running : undefined,
        effort: mapEffort(step.effort),
        important: step.important ?? false,
      });
      running += duration ?? 0;
    }
  }

  return {
    name: (proposed.name ?? '').trim(),
    description: (proposed.description ?? '').trim(),
    photoUri: null,
    photoEmoji: proposed.photo_emoji?.trim() || '🍽️',
    baseServings: typeof proposed.base_servings === 'number' && proposed.base_servings >= 1 ? Math.round(proposed.base_servings) : 2,
    timelineMode: isParallel ? 'parallel' : 'sequential',
    originLabel: '',
    lanes: isParallel ? lanes.map((l) => l.name) : [],
    ingredients,
    steps,
    tags: [],
  };
}

// The inverse mapping: a RecipeDraft back into propose_recipe shape. Used to
// hand the model the CURRENT RECIPE STATE (§7.3) — including manual edits made
// on the review screen — and to seed an existing-recipe refinement chat from
// the saved recipe's loaded draft (§2.2).
export function draftToProposed(draft: RecipeDraft): ProposedRecipe {
  const laneNames = draft.lanes.length > 0 ? draft.lanes : ['Main'];
  const lanes: ProposedRecipe['lanes'] = laneNames.map((name) => ({ name, steps: [] }));
  const laneByName = new Map(lanes.map((l) => [l.name, l]));
  const mainLane = laneByName.get(laneNames[0])!;

  for (const step of draft.steps) {
    const target = (step.lane != null ? laneByName.get(step.lane) : undefined) ?? mainLane;
    target.steps.push({
      instruction: step.instruction,
      phase: step.phase,
      effort: step.effort === 'passive' ? 'low' : 'medium',
      important: step.important,
      duration_seconds: step.durationSeconds ?? null,
    });
  }

  return {
    name: draft.name,
    description: draft.description || undefined,
    base_servings: draft.baseServings,
    photo_emoji: draft.photoEmoji,
    ingredients: draft.ingredients.map((i) => ({
      display_name: i.displayName,
      quantity: i.quantity || undefined,
      unit: i.unit,
      scalable: i.scalable,
      optional: i.optional,
    })),
    lanes: lanes.filter((l) => l.steps.length > 0 || lanes.length === 1),
  };
}

export interface ResolvedIngredients {
  ingredients: RecipeIngredientDraft[];
  /** Lowercased display names the app auto-created this pass (§6 "New" badge). */
  newIngredientNames: Set<string>;
}

// §6: resolve each free-text ingredient name against canonical_ingredient
// (exact name/alias = a confident match, mirroring the import path). A
// confident match auto-attaches canonical_id; anything unmatched is
// auto-created as a user-sourced canonical row and flagged "new" so the Review
// screen can badge it for a quick merge/fix. Never blocks on user input.
export async function resolveDraftIngredients(
  db: DbClient,
  ingredients: RecipeIngredientDraft[],
): Promise<ResolvedIngredients> {
  const newIngredientNames = new Set<string>();
  const resolved: RecipeIngredientDraft[] = [];
  for (const ing of ingredients) {
    const name = ing.displayName.trim();
    if (!name) {
      resolved.push({ ...ing });
      continue;
    }
    // §B5 Layer 2: match/create on the plain ingredient (prep descriptors
    // stripped), but keep the displayed name as-is — the schema deliberately
    // lets display_name carry prep ("chicken thigh, diced") while canonical_id
    // points at the plain ingredient, so "Parmesan, grated" links to existing
    // "parmesan" instead of spawning a duplicate row.
    const matchName = stripPrepDescriptors(name);
    const existingId = ing.canonicalId ?? (await resolveCanonicalIngredientId(db, matchName));
    if (existingId != null) {
      resolved.push({ ...ing, canonicalId: existingId });
      continue;
    }
    const created = await createUserIngredient(db, matchName, baseUnitForRecipeUnit(ing.unit));
    // Badge against the on-screen display name (§6), which is what the Review
    // screen renders and compares.
    newIngredientNames.add(name.toLowerCase());
    resolved.push({ ...ing, canonicalId: created.id });
  }
  return { ingredients: resolved, newIngredientNames };
}
