// Pure diff/similarity helpers for the §7.3 import flow. No DB, no native
// modules — kept separate from importRecipe.ts so the comparison logic is
// unit-testable in isolation.
import type { SharePayload } from './payload';

export interface DiffField {
  field: string;
  local: unknown;
  incoming: unknown;
  changed: boolean;
}

function stableIngredients(payload: SharePayload) {
  return payload.ingredients
    .map((i) => `${i.canonical_name}|${i.display_name}|${i.quantity}|${i.unit}|${i.scalable}|${i.optional}`)
    .sort();
}

function stableSteps(payload: SharePayload) {
  return payload.steps.map(
    (s) => `${s.lane ?? ''}|${s.phase}|${s.instruction}|${s.duration_seconds ?? ''}|${s.start_offset_seconds}|${s.effort}|${s.important}`,
  );
}

function stableTags(payload: SharePayload) {
  return [...payload.tags].sort();
}

function stableLanes(payload: SharePayload) {
  return payload.lanes.map((l) => l.name);
}

function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Field-by-field comparison (§7.3 "diff view — field-by-field, changed
// values highlighted"). Photo is deliberately excluded: it's opt-in at
// share time and its presence/absence doesn't represent a content change
// to the recipe's lineage.
export function diffPayloads(local: SharePayload, incoming: SharePayload): DiffField[] {
  const rows: [string, unknown, unknown][] = [
    ['name', local.recipe.name, incoming.recipe.name],
    ['description', local.recipe.description, incoming.recipe.description],
    ['base_servings', local.recipe.base_servings, incoming.recipe.base_servings],
    ['timeline_mode', local.recipe.timeline_mode, incoming.recipe.timeline_mode],
    ['origin_label', local.recipe.origin_label, incoming.recipe.origin_label],
    ['origin_url', local.recipe.origin_url, incoming.recipe.origin_url],
    ['photo_emoji', local.recipe.photo_emoji, incoming.recipe.photo_emoji],
    ['lanes', stableLanes(local), stableLanes(incoming)],
    ['ingredients', stableIngredients(local), stableIngredients(incoming)],
    ['steps', stableSteps(local), stableSteps(incoming)],
    ['tags', stableTags(local), stableTags(incoming)],
  ];
  return rows.map(([field, localValue, incomingValue]) => ({
    field,
    local: localValue,
    incoming: incomingValue,
    changed: !eq(localValue, incomingValue),
  }));
}

export function payloadsDiffer(local: SharePayload, incoming: SharePayload): boolean {
  return diffPayloads(local, incoming).some((f) => f.changed);
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Cheap edit-distance for the §7.3 "name similar" prompt — not a spelling
// corrector, just enough to catch "Green Curry" vs "Green Curry " or a
// trivial retype ("Thai Green Curry" vs "Thai Green Curry (Nana's)").
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

export function isNameSimilar(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const distance = levenshteinDistance(na, nb);
  const threshold = Math.max(2, Math.floor(Math.max(na.length, nb.length) * 0.2));
  return distance <= threshold;
}
