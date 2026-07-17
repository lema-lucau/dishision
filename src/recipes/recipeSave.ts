// Manual recipe create/update (§5.5 write path). Mirrors the seed runner's
// child-replacement strategy (delete + reinsert lanes/ingredients/steps/tags)
// but keyed on recipe.id rather than seed_id, since manual recipes have none.
import type { DbClient } from '../db/DbClient';
import { uuidv4 } from '../utils/uuid';
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
  baseServings: number;
  timelineMode: TimelineMode;
  originLabel: string;
  lanes: string[];
  ingredients: RecipeIngredientDraft[];
  steps: RecipeStepDraft[];
  tags: string[];
}

async function resolveOrCreateTagId(db: DbClient, name: string): Promise<number> {
  const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM tag WHERE name = ?', [name]);
  if (existing) return existing.id;
  const result = await db.runAsync('INSERT INTO tag (name, type) VALUES (?, ?)', [name, 'custom']);
  return result.lastInsertRowId;
}

async function writeChildren(db: DbClient, recipeId: number, draft: RecipeDraft): Promise<void> {
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
      [recipeId, ing.canonicalId, ing.displayName, ing.quantity, ing.unit, ing.scalable ? 1 : 0, ing.optional ? 1 : 0, index],
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

export async function createManualRecipe(db: DbClient, draft: RecipeDraft): Promise<number> {
  await db.execAsync('BEGIN');
  try {
    const result = await db.runAsync(
      `INSERT INTO recipe (share_id, name, description, photo_emoji, base_servings, timeline_mode, source, origin_label)
       VALUES (?, ?, ?, ?, ?, ?, 'manual', ?)`,
      [uuidv4(), draft.name, draft.description || null, draft.photoEmoji, draft.baseServings, draft.timelineMode, draft.originLabel || null],
    );
    const recipeId = result.lastInsertRowId;
    await writeChildren(db, recipeId, draft);
    await db.execAsync('COMMIT');
    return recipeId;
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
}

export async function updateManualRecipe(db: DbClient, recipeId: number, draft: RecipeDraft): Promise<void> {
  await db.execAsync('BEGIN');
  try {
    await db.runAsync(
      `UPDATE recipe
       SET name = ?, description = ?, photo_emoji = ?, base_servings = ?, timeline_mode = ?,
           origin_label = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [draft.name, draft.description || null, draft.photoEmoji, draft.baseServings, draft.timelineMode, draft.originLabel || null, recipeId],
    );
    await writeChildren(db, recipeId, draft);
    await db.execAsync('COMMIT');
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
}
