// Manual recipe create/update (§5.5 write path). Mirrors the seed runner's
// child-replacement strategy (delete + reinsert lanes/ingredients/steps/tags)
// but keyed on recipe.id rather than seed_id, since manual recipes have none.
import type { DbClient } from '../db/DbClient';
import { invalidateMedianCostCache } from '../recommend/medianCostCache';
import { uuidv4 } from '../utils/uuid';
import { capitalize } from '../lib/capitalize';
import type { Effort, Phase, RecipeUnit, TimelineMode } from '../seed/types';

export interface RecipeIngredientDraft {
  canonicalId: number | null;
  displayName: string;
  quantity: number;
  unit: RecipeUnit;
  scalable: boolean;
  optional: boolean;
}

export interface RecipeStepDraft {
  lane?: string;
  phase: Phase;
  instruction: string;
  durationSeconds?: number;
  startOffsetSeconds?: number;
  effort: Effort;
  important: boolean;
}

export interface RecipeDraft {
  name: string;
  description: string;
  photoEmoji: string;
  /** §8 pipeline output, or null for "no photo, use the emoji fallback".
   * `undefined` means "leave whatever is already stored alone" — the import
   * path (§7.3) uses that, because it applies its own photo separately from
   * the base64 payload and must not wipe a local photo on a merge. */
  photoUri?: string | null;
  baseServings: number;
  timelineMode: TimelineMode;
  originLabel: string;
  lanes: string[];
  ingredients: RecipeIngredientDraft[];
  steps: RecipeStepDraft[];
  tags: string[];
}

async function resolveOrCreateTagId(db: DbClient, name: string): Promise<number> {
  const capitalized = capitalize(name.trim());
  const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM tag WHERE name = ? COLLATE NOCASE', [capitalized]);
  if (existing) return existing.id;
  const result = await db.runAsync('INSERT INTO tag (name, type) VALUES (?, ?)', [capitalized, 'custom']);
  return result.lastInsertRowId;
}

export async function writeChildren(db: DbClient, recipeId: number, draft: RecipeDraft): Promise<void> {
  await db.runAsync('DELETE FROM recipe_step WHERE recipe_id = ?', [recipeId]);
  await db.runAsync('DELETE FROM step_lane WHERE recipe_id = ?', [recipeId]);
  await db.runAsync('DELETE FROM recipe_ingredient WHERE recipe_id = ?', [recipeId]);
  await db.runAsync('DELETE FROM recipe_tag WHERE recipe_id = ?', [recipeId]);

  const laneIds = new Map<string, number>();
  for (const [index, laneName] of draft.lanes.entries()) {
    const result = await db.runAsync('INSERT INTO step_lane (recipe_id, name, sort_order) VALUES (?, ?, ?)', [
      recipeId,
      laneName,
      index,
    ]);
    laneIds.set(laneName, result.lastInsertRowId);
  }

  for (const [index, ing] of draft.ingredients.entries()) {
    await db.runAsync(
      `INSERT INTO recipe_ingredient (recipe_id, canonical_id, display_name, quantity, unit, scalable, optional, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [recipeId, ing.canonicalId, capitalize(ing.displayName.trim()), ing.quantity, ing.unit, ing.scalable ? 1 : 0, ing.optional ? 1 : 0, index],
    );
  }

  for (const [index, step] of draft.steps.entries()) {
    const laneId = step.lane != null ? laneIds.get(step.lane) ?? null : null;
    await db.runAsync(
      `INSERT INTO recipe_step (recipe_id, lane_id, phase, instruction, duration_seconds, start_offset_seconds, effort, important, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        recipeId,
        laneId,
        step.phase,
        step.instruction,
        step.durationSeconds ?? null,
        draft.timelineMode === 'parallel' ? step.startOffsetSeconds ?? 0 : 0,
        step.effort,
        step.important ? 1 : 0,
        index,
      ],
    );
  }

  for (const tagName of draft.tags) {
    const tagId = await resolveOrCreateTagId(db, tagName);
    await db.runAsync('INSERT OR IGNORE INTO recipe_tag (recipe_id, tag_id) VALUES (?, ?)', [recipeId, tagId]);
  }
}

// Shared by createManualRecipe and the S13 import write path (§7.3), which
// must preserve the payload's own share_id rather than minting a fresh one.
export interface CreateRecipeMeta {
  shareId: string;
  source: 'manual' | 'imported';
  importedFrom?: string | null;
  importedAt?: string | null;
}

export async function createRecipeFromDraft(db: DbClient, draft: RecipeDraft, meta: CreateRecipeMeta): Promise<number> {
  await db.execAsync('BEGIN');
  try {
    const result = await db.runAsync(
      `INSERT INTO recipe (share_id, name, description, photo_uri, photo_emoji, base_servings, timeline_mode, source, origin_label, imported_from, imported_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        meta.shareId,
        draft.name,
        draft.description || null,
        draft.photoUri ?? null,
        draft.photoEmoji,
        draft.baseServings,
        draft.timelineMode,
        meta.source,
        draft.originLabel || null,
        meta.importedFrom ?? null,
        meta.importedAt ?? null,
      ],
    );
    const recipeId = result.lastInsertRowId;
    await writeChildren(db, recipeId, draft);
    await db.execAsync('COMMIT');
    await invalidateMedianCostCache(db);
    return recipeId;
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
}

export async function createManualRecipe(db: DbClient, draft: RecipeDraft): Promise<number> {
  return createRecipeFromDraft(db, draft, { shareId: uuidv4(), source: 'manual' });
}

export async function updateManualRecipe(db: DbClient, recipeId: number, draft: RecipeDraft): Promise<void> {
  await db.execAsync('BEGIN');
  try {
    // photo_uri is only written when the draft actually carries the field — an
    // `undefined` photoUri leaves the stored photo untouched (see RecipeDraft).
    const setsPhoto = draft.photoUri !== undefined;
    await db.runAsync(
      `UPDATE recipe
       SET name = ?, description = ?, photo_emoji = ?, base_servings = ?, timeline_mode = ?,
           origin_label = ?, updated_at = datetime('now')${setsPhoto ? ', photo_uri = ?' : ''}
       WHERE id = ?`,
      setsPhoto
        ? [draft.name, draft.description || null, draft.photoEmoji, draft.baseServings, draft.timelineMode, draft.originLabel || null, draft.photoUri ?? null, recipeId]
        : [draft.name, draft.description || null, draft.photoEmoji, draft.baseServings, draft.timelineMode, draft.originLabel || null, recipeId],
    );
    await writeChildren(db, recipeId, draft);
    await db.execAsync('COMMIT');
    await invalidateMedianCostCache(db);
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
}

// S13 import "Merge" path (§7.3): overwrite an existing recipe's content
// in place (same id, same share_id/lineage) with an incoming payload's
// fields, and record that it arrived via import.
export async function updateRecipeFromImport(
  db: DbClient,
  recipeId: number,
  draft: RecipeDraft,
  importedFrom: string | null,
  /** When set, also adopts this share_id — the "name similar, no share_id
   * match" merge path (§7.3): the local recipe's old lineage identity is
   * retired in favour of the incoming payload's. Safe because that share_id
   * is, by construction, not already in use locally (that's why it didn't
   * match in the first place). */
  adoptShareId?: string,
): Promise<void> {
  await db.execAsync('BEGIN');
  try {
    await db.runAsync(
      `UPDATE recipe
       SET name = ?, description = ?, photo_emoji = ?, base_servings = ?, timeline_mode = ?,
           origin_label = ?, source = 'imported', imported_from = ?, imported_at = datetime('now'),
           updated_at = datetime('now')${adoptShareId ? ', share_id = ?' : ''}
       WHERE id = ?`,
      adoptShareId
        ? [draft.name, draft.description || null, draft.photoEmoji, draft.baseServings, draft.timelineMode, draft.originLabel || null, importedFrom, adoptShareId, recipeId]
        : [draft.name, draft.description || null, draft.photoEmoji, draft.baseServings, draft.timelineMode, draft.originLabel || null, importedFrom, recipeId],
    );
    await writeChildren(db, recipeId, draft);
    await db.execAsync('COMMIT');
    await invalidateMedianCostCache(db);
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
}
