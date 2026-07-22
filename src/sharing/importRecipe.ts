// §7.3 import: match by share_id, never write silently — every path here
// is meant to be driven from a preview screen, not called blind.
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import type { RecipeDraft, RecipeIngredientDraft } from '../recipes/recipeSave';
import { createRecipeFromDraft, updateRecipeFromImport } from '../recipes/recipeSave';
import { uuidv4 } from '../utils/uuid';
import { buildSharePayload } from './payload';
import { diffPayloads, isNameSimilar, payloadsDiffer, type DiffField } from './diff';
import type { SharePayload } from './payload';
import { resolveCanonicalIngredientId } from './resolveCanonicalIngredient';

export type ImportMatchState =
  | { kind: 'no_match' }
  | { kind: 'identical'; localRecipeId: number }
  | { kind: 'differs'; localRecipeId: number; diff: DiffField[] }
  | { kind: 'name_similar'; candidateRecipeId: number; candidateName: string };

export interface UnresolvedIngredientInfo {
  displayName: string;
  canonicalName: string;
  matched: boolean;
}

export async function matchImport(db: DbClient, payload: SharePayload): Promise<ImportMatchState> {
  const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM recipe WHERE share_id = ?', [payload.share_id]);
  if (existing) {
    const localPayload = await buildSharePayload(db, existing.id, { includePhoto: false });
    if (!payloadsDiffer(localPayload, payload)) {
      return { kind: 'identical', localRecipeId: existing.id };
    }
    return { kind: 'differs', localRecipeId: existing.id, diff: diffPayloads(localPayload, payload) };
  }

  const candidates = await db.getAllAsync<{ id: number; name: string }>('SELECT id, name FROM recipe');
  const nameMatch = candidates.find((c) => isNameSimilar(c.name, payload.recipe.name));
  if (nameMatch) {
    return { kind: 'name_similar', candidateRecipeId: nameMatch.id, candidateName: nameMatch.name };
  }
  return { kind: 'no_match' };
}

// Which of a payload's ingredients resolved against the local canonical
// table — surfaced on the preview screen so an import never silently
// drops macro/cost coverage without saying so.
export async function checkIngredientResolution(db: DbClient, payload: SharePayload): Promise<UnresolvedIngredientInfo[]> {
  const results: UnresolvedIngredientInfo[] = [];
  for (const ing of payload.ingredients) {
    const id = await resolveCanonicalIngredientId(db, ing.canonical_name);
    results.push({ displayName: ing.display_name, canonicalName: ing.canonical_name, matched: id != null });
  }
  return results;
}

export async function buildDraftFromPayload(db: DbClient, payload: SharePayload): Promise<RecipeDraft> {
  return buildDraft(db, payload);
}

async function buildDraft(db: DbClient, payload: SharePayload): Promise<RecipeDraft> {
  const ingredients: RecipeIngredientDraft[] = [];
  for (const ing of payload.ingredients) {
    const canonicalId = await resolveCanonicalIngredientId(db, ing.canonical_name);
    ingredients.push({
      canonicalId,
      displayName: ing.display_name,
      quantity: ing.quantity,
      unit: ing.unit,
      scalable: ing.scalable,
      optional: ing.optional,
    });
  }
  return {
    name: payload.recipe.name,
    description: payload.recipe.description ?? '',
    photoEmoji: payload.recipe.photo_emoji,
    baseServings: payload.recipe.base_servings,
    timelineMode: payload.recipe.timeline_mode,
    originLabel: payload.recipe.origin_label ?? '',
    lanes: payload.lanes.map((l) => l.name),
    ingredients,
    steps: payload.steps.map((s) => ({
      lane: s.lane ?? undefined,
      phase: s.phase,
      instruction: s.instruction,
      durationSeconds: s.duration_seconds ?? undefined,
      startOffsetSeconds: s.start_offset_seconds,
      effort: s.effort,
      important: s.important,
    })),
    tags: payload.tags,
  };
}

async function applyPhoto(db: DbClient, recipeId: number, payload: SharePayload): Promise<void> {
  if (!payload.recipe.photo) return;
  const { writeBase64Photo } = await import('./photoBase64');
  const uri = await writeBase64Photo(payload.recipe.photo);
  await db.runAsync('UPDATE recipe SET photo_uri = ? WHERE id = ?', [uri, recipeId]);
}

// §7.3 "No match → Import as new". Preserves the payload's own share_id,
// since nothing local carries it yet.
export async function importAsNew(db: DbClient, payload: SharePayload, importedFrom: string | null): Promise<number> {
  const draft = await buildDraft(db, payload);
  const recipeId = await createRecipeFromDraft(db, draft, {
    shareId: payload.share_id,
    source: 'imported',
    importedFrom,
    importedAt: new Date().toISOString(),
  });
  await applyPhoto(db, recipeId, payload);
  logger.info('db', 'Imported recipe as new', { recipeId, shareId: payload.share_id });
  return recipeId;
}

// §7.3 "Merge": overwrite the existing recipe's content in place, adopting
// the incoming payload's share_id. Covers both call sites — "share_id
// match, differs" (adoption is a no-op, it already matches) and the
// "name similar, no share_id match" path (adoption retires the local
// recipe's old lineage identity in favour of the imported one).
export async function importMerge(db: DbClient, localRecipeId: number, payload: SharePayload, importedFrom: string | null): Promise<void> {
  const draft = await buildDraft(db, payload);
  await updateRecipeFromImport(db, localRecipeId, draft, importedFrom, payload.share_id);
  await applyPhoto(db, localRecipeId, payload);
  logger.info('db', 'Merged imported recipe', { localRecipeId, shareId: payload.share_id });
}

// §7.3 "share_id match, differs → Keep both": the incoming payload becomes
// its own recipe, forking a fresh share_id since the column is UNIQUE and
// the existing row already owns payload.share_id.
export async function importKeepBoth(db: DbClient, payload: SharePayload, importedFrom: string | null): Promise<number> {
  const draft = await buildDraft(db, payload);
  draft.name = `${draft.name} (imported)`;
  const recipeId = await createRecipeFromDraft(db, draft, {
    shareId: uuidv4(),
    source: 'imported',
    importedFrom,
    importedAt: new Date().toISOString(),
  });
  await applyPhoto(db, recipeId, payload);
  logger.info('db', 'Imported recipe as a new copy (kept both)', { recipeId });
  return recipeId;
}

// §7.3 manual merge tool: "pick two recipes from the library, confirm
// they're the same lineage, and one adopts the other's share_id." One row
// is kept (with its ingredients/steps as authored), the other is deleted
// (its cook logs/favourites/exclusions cascade away with it — the caller's
// confirmation UI must say so plainly before calling this). adoptShareId
// picks which lineage identity survives on the kept row.
export async function mergeRecipeLineage(
  db: DbClient,
  keepRecipeId: number,
  duplicateRecipeId: number,
  adoptShareId: 'keep' | 'duplicate',
): Promise<void> {
  if (keepRecipeId === duplicateRecipeId) throw new Error('Cannot merge a recipe with itself');
  await db.execAsync('BEGIN');
  try {
    if (adoptShareId === 'duplicate') {
      const dup = await db.getFirstAsync<{ share_id: string }>('SELECT share_id FROM recipe WHERE id = ?', [duplicateRecipeId]);
      if (!dup) throw new Error(`Recipe ${duplicateRecipeId} not found`);
      // Free the share_id (UNIQUE) before the duplicate row is deleted and
      // the keeper adopts it, or the two updates would collide mid-transaction.
      await db.runAsync('UPDATE recipe SET share_id = ? WHERE id = ?', [uuidv4(), duplicateRecipeId]);
      await db.runAsync('UPDATE recipe SET share_id = ? WHERE id = ?', [dup.share_id, keepRecipeId]);
    }
    await db.runAsync('DELETE FROM recipe WHERE id = ?', [duplicateRecipeId]);
    await db.execAsync('COMMIT');
    logger.info('db', 'Merged recipe lineage', { keepRecipeId, duplicateRecipeId, adoptShareId });
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
}
