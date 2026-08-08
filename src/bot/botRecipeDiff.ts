// §9 refinement diff review. Compares the working draft (pre-refinement) with
// the bot's new candidate and produces a flat list of individually
// accept/rejectable changes: recipe-level fields, per-ingredient, per-step (by
// lane), and a single "steps reordered" toggle per lane when only the order
// changed. Applying re-derives the merged draft deterministically from the same
// id scheme, so unchecked changes revert cleanly to their pre-refinement value.
//
// This is the "extended to compare two recipe candidates" version of the merge
// UI the app already uses for duplicate recipes (§9) — same visual grammar
// (RecipeDiffView-style removed/added lines), finer granularity.
import type { RecipeDraft, RecipeIngredientDraft, RecipeStepDraft } from '../recipes/recipeSave';

export type BotDiffGroup = 'field' | 'ingredient' | 'step' | 'reorder';
export type BotDiffChangeType = 'added' | 'removed' | 'modified' | 'reordered';

export interface BotDiffChange {
  id: string;
  group: BotDiffGroup;
  /** Section heading: "Name", "Ingredients", or a lane name. */
  section: string;
  changeType: BotDiffChangeType;
  oldText: string | null;
  newText: string | null;
}

const MAIN_LANE = 'Main';

function laneKey(step: RecipeStepDraft): string {
  return step.lane ?? MAIN_LANE;
}

function ingredientKey(ing: RecipeIngredientDraft): string {
  return ing.canonicalId != null ? `c:${ing.canonicalId}` : `n:${ing.displayName.trim().toLowerCase()}`;
}

export function ingredientLine(ing: RecipeIngredientDraft): string {
  const qty = ing.quantity ? `${ing.quantity} ${ing.unit}` : ing.unit;
  return `${qty} · ${ing.displayName}${ing.optional ? ' (optional)' : ''}`;
}

function stepSignature(step: RecipeStepDraft): string {
  return [step.phase, step.instruction.trim(), step.effort, step.durationSeconds ?? '', step.important ? '!' : ''].join('|');
}

export function stepLine(step: RecipeStepDraft): string {
  const phase = step.phase.charAt(0).toUpperCase() + step.phase.slice(1);
  const mins = step.durationSeconds ? ` (${Math.round(step.durationSeconds / 60)}m)` : '';
  return `${phase}: ${step.instruction}${mins}`;
}

function groupByLane(steps: RecipeStepDraft[]): Map<string, RecipeStepDraft[]> {
  const map = new Map<string, RecipeStepDraft[]>();
  for (const s of steps) {
    const key = laneKey(s);
    const list = map.get(key) ?? [];
    list.push(s);
    map.set(key, list);
  }
  return map;
}

// Ordered union of lane keys — next's lanes first (its ordering wins), then any
// lane only present in the base draft.
function laneOrder(base: Map<string, RecipeStepDraft[]>, next: Map<string, RecipeStepDraft[]>): string[] {
  const order = [...next.keys()];
  for (const k of base.keys()) if (!order.includes(k)) order.push(k);
  return order;
}

const FIELD_DEFS: { id: string; label: string; get: (d: RecipeDraft) => string }[] = [
  { id: 'field:name', label: 'Name', get: (d) => d.name },
  { id: 'field:description', label: 'Description', get: (d) => d.description },
  { id: 'field:servings', label: 'Servings', get: (d) => String(d.baseServings) },
  { id: 'field:emoji', label: 'Emoji', get: (d) => d.photoEmoji },
  { id: 'field:timeline', label: 'Timeline', get: (d) => d.timelineMode },
];

export function buildBotDiff(base: RecipeDraft, next: RecipeDraft): BotDiffChange[] {
  const changes: BotDiffChange[] = [];

  // ── recipe-level fields ──
  for (const f of FIELD_DEFS) {
    const oldText = f.get(base);
    const newText = f.get(next);
    if (oldText !== newText) {
      changes.push({ id: f.id, group: 'field', section: f.label, changeType: 'modified', oldText: oldText || '—', newText: newText || '—' });
    }
  }

  // ── ingredients (keyed by canonical id, else display name) ──
  const baseIng = new Map(base.ingredients.map((i) => [ingredientKey(i), i]));
  const nextIng = new Map(next.ingredients.map((i) => [ingredientKey(i), i]));
  for (const [key, ing] of nextIng) {
    const prior = baseIng.get(key);
    if (!prior) {
      changes.push({ id: `ing:${key}`, group: 'ingredient', section: 'Ingredients', changeType: 'added', oldText: null, newText: ingredientLine(ing) });
    } else if (ingredientLine(prior) !== ingredientLine(ing)) {
      changes.push({ id: `ing:${key}`, group: 'ingredient', section: 'Ingredients', changeType: 'modified', oldText: ingredientLine(prior), newText: ingredientLine(ing) });
    }
  }
  for (const [key, ing] of baseIng) {
    if (!nextIng.has(key)) {
      changes.push({ id: `ing:${key}`, group: 'ingredient', section: 'Ingredients', changeType: 'removed', oldText: ingredientLine(ing), newText: null });
    }
  }

  // ── steps, per lane ──
  const baseLanes = groupByLane(base.steps);
  const nextLanes = groupByLane(next.steps);
  for (const lane of laneOrder(baseLanes, nextLanes)) {
    const b = baseLanes.get(lane) ?? [];
    const n = nextLanes.get(lane) ?? [];
    const bSigs = b.map(stepSignature);
    const nSigs = n.map(stepSignature);
    const sameMultiset = bSigs.length === nSigs.length && [...bSigs].sort().join('§') === [...nSigs].sort().join('§');

    if (sameMultiset && bSigs.join('§') !== nSigs.join('§')) {
      // Pure reordering — a single toggle for the lane (§9).
      changes.push({ id: `reorder:${lane}`, group: 'reorder', section: lane, changeType: 'reordered', oldText: b.map(stepLine).join('\n'), newText: n.map(stepLine).join('\n') });
      continue;
    }
    if (sameMultiset) continue; // identical lane, no rows

    // Position-aligned: each index is added / removed / reworded on its own.
    const max = Math.max(b.length, n.length);
    for (let i = 0; i < max; i++) {
      const bs = b[i];
      const ns = n[i];
      const id = `step:${lane}:${i}`;
      if (bs && ns) {
        if (stepSignature(bs) !== stepSignature(ns)) {
          changes.push({ id, group: 'step', section: lane, changeType: 'modified', oldText: stepLine(bs), newText: stepLine(ns) });
        }
      } else if (ns) {
        changes.push({ id, group: 'step', section: lane, changeType: 'added', oldText: null, newText: stepLine(ns) });
      } else if (bs) {
        changes.push({ id, group: 'step', section: lane, changeType: 'removed', oldText: stepLine(bs), newText: null });
      }
    }
  }

  return changes;
}

// Recompute lanes/timelineMode from the merged step list so the draft stays
// internally consistent whatever mix of changes was accepted.
function reconcileLanes(steps: RecipeStepDraft[]): { steps: RecipeStepDraft[]; lanes: string[]; timelineMode: RecipeDraft['timelineMode'] } {
  const laneNames = [...new Set(steps.map(laneKey).filter((l) => l !== MAIN_LANE))];
  if (laneNames.length === 0) {
    return { steps: steps.map((s) => ({ ...s, lane: undefined })), lanes: [], timelineMode: 'sequential' };
  }
  return { steps, lanes: laneNames, timelineMode: 'parallel' };
}

// Apply the accepted changes on top of `base`, pulling accepted values from
// `next` and leaving everything unchecked at its pre-refinement value.
export function applyBotDiff(base: RecipeDraft, next: RecipeDraft, accepted: Set<string>): RecipeDraft {
  const result: RecipeDraft = { ...base };

  // Fields.
  if (accepted.has('field:name')) result.name = next.name;
  if (accepted.has('field:description')) result.description = next.description;
  if (accepted.has('field:servings')) result.baseServings = next.baseServings;
  if (accepted.has('field:emoji')) result.photoEmoji = next.photoEmoji;

  // Ingredients.
  const baseIng = new Map(base.ingredients.map((i) => [ingredientKey(i), i]));
  const nextIng = new Map(next.ingredients.map((i) => [ingredientKey(i), i]));
  const mergedIngredients: RecipeIngredientDraft[] = [];
  for (const [key, ing] of nextIng) {
    const prior = baseIng.get(key);
    const id = `ing:${key}`;
    if (!prior) {
      if (accepted.has(id)) mergedIngredients.push(ing); // accepted addition
    } else if (ingredientLine(prior) !== ingredientLine(ing)) {
      mergedIngredients.push(accepted.has(id) ? ing : prior); // modified
    } else {
      mergedIngredients.push(prior); // unchanged
    }
  }
  for (const [key, ing] of baseIng) {
    if (!nextIng.has(key)) {
      // A removal: dropping it is the accepted state; rejecting keeps it.
      if (!accepted.has(`ing:${key}`)) mergedIngredients.push(ing);
    }
  }
  result.ingredients = mergedIngredients;

  // Steps, per lane.
  const baseLanes = groupByLane(base.steps);
  const nextLanes = groupByLane(next.steps);
  const mergedSteps: RecipeStepDraft[] = [];
  for (const lane of laneOrder(baseLanes, nextLanes)) {
    const b = baseLanes.get(lane) ?? [];
    const n = nextLanes.get(lane) ?? [];
    const bSigs = b.map(stepSignature);
    const nSigs = n.map(stepSignature);
    const sameMultiset = bSigs.length === nSigs.length && [...bSigs].sort().join('§') === [...nSigs].sort().join('§');

    if (sameMultiset && bSigs.join('§') !== nSigs.join('§')) {
      mergedSteps.push(...(accepted.has(`reorder:${lane}`) ? n : b));
      continue;
    }
    if (sameMultiset) {
      mergedSteps.push(...b);
      continue;
    }
    const max = Math.max(b.length, n.length);
    for (let i = 0; i < max; i++) {
      const bs = b[i];
      const ns = n[i];
      const id = `step:${lane}:${i}`;
      if (bs && ns) {
        if (stepSignature(bs) !== stepSignature(ns)) mergedSteps.push(accepted.has(id) ? ns : bs);
        else mergedSteps.push(bs);
      } else if (ns) {
        if (accepted.has(id)) mergedSteps.push(ns); // accepted addition
      } else if (bs) {
        if (!accepted.has(id)) mergedSteps.push(bs); // rejected removal keeps it
      }
    }
  }
  const reconciled = reconcileLanes(mergedSteps);
  result.steps = reconciled.steps;
  result.lanes = reconciled.lanes;
  // Timeline follows the merged structure, unless the user explicitly accepted
  // the timeline field change and it still matches.
  result.timelineMode = reconciled.timelineMode;

  return result;
}

export function hasBotDiff(base: RecipeDraft, next: RecipeDraft): boolean {
  return buildBotDiff(base, next).length > 0;
}
