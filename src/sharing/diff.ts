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

// ---------------------------------------------------------------------------
// Detailed, human-readable diff (used by the shared RecipeDiffView, driving
// both the import preview and the manual merge-duplicates screen). Unlike
// diffPayloads above — which reports lists as "N items" for the terse
// summary — this renders the actual changed lines so the user can see exactly
// what they're merging, keeping, or discarding, and pick per field.
// ---------------------------------------------------------------------------

export type DiffFieldKey =
  | 'name'
  | 'description'
  | 'base_servings'
  | 'timeline_mode'
  | 'origin_label'
  | 'origin_url'
  | 'photo_emoji'
  | 'lanes'
  | 'ingredients'
  | 'steps'
  | 'tags';

export interface ScalarDiffRow {
  field: DiffFieldKey;
  kind: 'scalar';
  changed: boolean;
  local: string;
  incoming: string;
}

export interface ListDiffRow {
  field: DiffFieldKey;
  kind: 'list';
  changed: boolean;
  localLines: string[];
  incomingLines: string[];
  /** Lines present in the incoming version but not the local one. */
  added: string[];
  /** Lines present locally but dropped in the incoming version. */
  removed: string[];
  /** Same set of lines, different order. */
  reordered: boolean;
}

export type DetailedDiffRow = ScalarDiffRow | ListDiffRow;

function scalarText(value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function ingredientLine(i: SharePayload['ingredients'][number]): string {
  const qty = i.quantity ? `${i.quantity} ${i.unit}` : i.unit;
  return `${qty} · ${i.display_name}${i.optional ? ' (optional)' : ''}`;
}

function stepLine(s: SharePayload['steps'][number]): string {
  const lane = s.lane ? ` [${s.lane}]` : '';
  const mins = s.duration_seconds ? ` (${Math.round(s.duration_seconds / 60)}m)` : '';
  const phase = s.phase.charAt(0).toUpperCase() + s.phase.slice(1);
  return `${phase}${lane}: ${s.instruction}${mins}`;
}

function listRow(field: DiffFieldKey, localLines: string[], incomingLines: string[]): ListDiffRow {
  const localSet = new Set(localLines);
  const incomingSet = new Set(incomingLines);
  const added = incomingLines.filter((l) => !localSet.has(l));
  const removed = localLines.filter((l) => !incomingSet.has(l));
  const sameSet = added.length === 0 && removed.length === 0;
  const reordered = sameSet && localLines.join('\n') !== incomingLines.join('\n');
  return {
    field,
    kind: 'list',
    changed: added.length > 0 || removed.length > 0 || reordered,
    localLines,
    incomingLines,
    added,
    removed,
    reordered,
  };
}

export function buildDetailedDiff(local: SharePayload, incoming: SharePayload): DetailedDiffRow[] {
  const scalar = (field: DiffFieldKey, a: unknown, b: unknown): ScalarDiffRow => ({
    field,
    kind: 'scalar',
    local: scalarText(a),
    incoming: scalarText(b),
    changed: scalarText(a) !== scalarText(b),
  });

  return [
    scalar('name', local.recipe.name, incoming.recipe.name),
    scalar('description', local.recipe.description, incoming.recipe.description),
    scalar('base_servings', local.recipe.base_servings, incoming.recipe.base_servings),
    scalar('timeline_mode', local.recipe.timeline_mode, incoming.recipe.timeline_mode),
    scalar('origin_label', local.recipe.origin_label, incoming.recipe.origin_label),
    scalar('origin_url', local.recipe.origin_url, incoming.recipe.origin_url),
    scalar('photo_emoji', local.recipe.photo_emoji, incoming.recipe.photo_emoji),
    listRow('lanes', local.lanes.map((l) => l.name), incoming.lanes.map((l) => l.name)),
    listRow('ingredients', local.ingredients.map(ingredientLine), incoming.ingredients.map(ingredientLine)),
    listRow('steps', local.steps.map(stepLine), incoming.steps.map(stepLine)),
    listRow('tags', [...local.tags], [...incoming.tags]),
  ];
}

// Build a payload that takes each field from either the local or incoming
// version according to `takeIncoming`. Unlisted fields default to the local
// value, so "take nothing" reproduces the local recipe. Keeps the incoming
// share_id and photo, since a selective merge still adopts the incoming
// lineage (mirrors importMerge's share_id adoption).
export function mergePayloads(
  local: SharePayload,
  incoming: SharePayload,
  takeIncoming: Partial<Record<DiffFieldKey, boolean>>,
): SharePayload {
  const take = (field: DiffFieldKey) => takeIncoming[field] === true;
  return {
    v: incoming.v,
    share_id: incoming.share_id,
    recipe: {
      name: take('name') ? incoming.recipe.name : local.recipe.name,
      description: take('description') ? incoming.recipe.description : local.recipe.description,
      base_servings: take('base_servings') ? incoming.recipe.base_servings : local.recipe.base_servings,
      timeline_mode: take('timeline_mode') ? incoming.recipe.timeline_mode : local.recipe.timeline_mode,
      origin_label: take('origin_label') ? incoming.recipe.origin_label : local.recipe.origin_label,
      origin_url: take('origin_url') ? incoming.recipe.origin_url : local.recipe.origin_url,
      photo: incoming.recipe.photo,
      photo_emoji: take('photo_emoji') ? incoming.recipe.photo_emoji : local.recipe.photo_emoji,
    },
    lanes: take('lanes') ? incoming.lanes : local.lanes,
    ingredients: take('ingredients') ? incoming.ingredients : local.ingredients,
    steps: take('steps') ? incoming.steps : local.steps,
    tags: take('tags') ? incoming.tags : local.tags,
  };
}

export const DIFF_FIELD_LABELS: Record<DiffFieldKey, string> = {
  name: 'Name',
  description: 'Description',
  base_servings: 'Servings',
  timeline_mode: 'Timeline',
  origin_label: 'Origin',
  origin_url: 'Origin link',
  photo_emoji: 'Emoji',
  lanes: 'Lanes',
  ingredients: 'Ingredients',
  steps: 'Steps',
  tags: 'Tags',
};

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
