// §5.9 substitutions: CRUD against cook_log_substitution, plus promote-to-recipe.
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { capitalize } from '../lib/capitalize';

export type SubstitutionVerdict = 'better' | 'same' | 'worse';

export interface SubstitutionDraft {
  cookLogId: number;
  /** null when the sub isn't tied to a specific recipe_ingredient row (free text). */
  originalIngredientId: number | null;
  /** Permanent snapshot — see promoteSubstitution for why this must never change post-promotion. */
  originalText: string;
  replacementText: string;
  verdict: SubstitutionVerdict | null;
}

export interface SubstitutionRow {
  id: number;
  cookLogId: number;
  originalIngredientId: number | null;
  originalText: string;
  replacementText: string;
  verdict: SubstitutionVerdict | null;
  promoted: boolean;
}

export async function createSubstitution(db: DbClient, draft: SubstitutionDraft): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO cook_log_substitution (cook_log_id, original_ingredient_id, original_text, replacement_text, verdict)
     VALUES (?, ?, ?, ?, ?)`,
    [draft.cookLogId, draft.originalIngredientId, capitalize(draft.originalText.trim()), capitalize(draft.replacementText.trim()), draft.verdict],
  );
  return result.lastInsertRowId;
}

// Editing a substitution is only meaningful before it's promoted — once
// promoted the row is the historical record of what actually got rewritten
// on the recipe, and original_text in particular must stay a stable snapshot
// (§5.9: "the log is what I made that night"). Delete-and-recreate is the
// escape hatch if a promoted row genuinely needs correcting.
export async function updateSubstitution(
  db: DbClient,
  substitutionId: number,
  draft: Omit<SubstitutionDraft, 'cookLogId'>,
): Promise<void> {
  const existing = await db.getFirstAsync<{ promoted: number }>(
    'SELECT promoted FROM cook_log_substitution WHERE id = ?',
    [substitutionId],
  );
  if (existing?.promoted === 1) {
    throw new Error(`Substitution ${substitutionId} is already promoted and can't be edited`);
  }
  await db.runAsync(
    `UPDATE cook_log_substitution
     SET original_ingredient_id = ?, original_text = ?, replacement_text = ?, verdict = ?
     WHERE id = ?`,
    [draft.originalIngredientId, capitalize(draft.originalText.trim()), capitalize(draft.replacementText.trim()), draft.verdict, substitutionId],
  );
}

export async function deleteSubstitution(db: DbClient, substitutionId: number): Promise<void> {
  await db.runAsync('DELETE FROM cook_log_substitution WHERE id = ?', [substitutionId]);
}

export async function loadSubstitutionsForLog(db: DbClient, cookLogId: number): Promise<SubstitutionRow[]> {
  const rows = await db.getAllAsync<{
    id: number;
    cook_log_id: number;
    original_ingredient_id: number | null;
    original_text: string;
    replacement_text: string;
    verdict: string | null;
    promoted: number;
  }>(
    `SELECT id, cook_log_id, original_ingredient_id, original_text, replacement_text, verdict, promoted
     FROM cook_log_substitution WHERE cook_log_id = ? ORDER BY id`,
    [cookLogId],
  );
  return rows.map((r) => ({
    id: r.id,
    cookLogId: r.cook_log_id,
    originalIngredientId: r.original_ingredient_id,
    originalText: r.original_text,
    replacementText: r.replacement_text,
    verdict: (r.verdict as SubstitutionVerdict | null) ?? null,
    promoted: r.promoted === 1,
  }));
}

// For the "pick which ingredient it replaces" step of the add-substitution
// flow (§5.9) — the recipe this cook log belongs to, not the substitution
// table itself.
export async function loadRecipeIngredientOptions(
  db: DbClient,
  recipeId: number,
): Promise<{ id: number; displayName: string }[]> {
  const rows = await db.getAllAsync<{ id: number; display_name: string }>(
    'SELECT id, display_name FROM recipe_ingredient WHERE recipe_id = ? ORDER BY sort_order',
    [recipeId],
  );
  return rows.map((r) => ({ id: r.id, displayName: r.display_name }));
}

export type PromoteResult = { ok: true } | { ok: false; reason: 'no_ingredient' };

// Promote to recipe (§5.9): rewrites recipe_ingredient.display_name to the
// substitution's replacement text and marks the substitution promoted.
//
// original_text is a permanent snapshot and is NEVER touched here — only
// promoted flips. That's the whole point: old logs stay self-describing
// regardless of what the recipe says today ("no recipe versioning" — the
// recipe is "how I make it today", the log is "what I made that night").
// canonical_id/quantity/unit are deliberately left alone too — re-deriving
// those from free replacement text is out of scope for this slice.
//
// Judgment call: if original_ingredient_id is null (never tied to a specific
// row) or no longer points at a live recipe_ingredient (deleted since the
// sub was logged — the FK is ON DELETE SET NULL), there is nothing to
// promote onto. This returns a failure rather than silently no-op'ing, and
// does NOT set promoted=1, since nothing was actually promoted — the caller
// can surface "that ingredient no longer exists on the recipe" instead of a
// false "done".
export async function promoteSubstitution(db: DbClient, substitutionId: number): Promise<PromoteResult> {
  const sub = await db.getFirstAsync<{ original_ingredient_id: number | null; replacement_text: string }>(
    'SELECT original_ingredient_id, replacement_text FROM cook_log_substitution WHERE id = ?',
    [substitutionId],
  );
  if (!sub || sub.original_ingredient_id == null) {
    return { ok: false, reason: 'no_ingredient' };
  }

  await db.execAsync('BEGIN');
  try {
    const result = await db.runAsync('UPDATE recipe_ingredient SET display_name = ? WHERE id = ?', [
      sub.replacement_text,
      sub.original_ingredient_id,
    ]);
    if (result.changes === 0) {
      // original_ingredient_id was set but the row is gone.
      await db.execAsync('ROLLBACK');
      return { ok: false, reason: 'no_ingredient' };
    }
    await db.runAsync('UPDATE cook_log_substitution SET promoted = 1 WHERE id = ?', [substitutionId]);
    await db.execAsync('COMMIT');
    logger.info('db', 'Promoted substitution to recipe', {
      substitutionId,
      recipeIngredientId: sub.original_ingredient_id,
    });
    return { ok: true };
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
}
