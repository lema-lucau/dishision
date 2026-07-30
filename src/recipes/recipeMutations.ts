// Recipe-level mutations that aren't full CRUD: favourite toggle,
// exclusions (§5.4, upsert rule per §2.3), and copy-and-tweak (§9.4).
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { invalidateMedianCostCache } from '../recommend/medianCostCache';
import { uuidv4 } from '../utils/uuid';

export async function toggleFavourite(db: DbClient, recipeId: number, isFavourite: boolean): Promise<void> {
  if (isFavourite) {
    await db.runAsync('DELETE FROM favourite WHERE recipe_id = ?', [recipeId]);
  } else {
    await db.runAsync('INSERT OR IGNORE INTO favourite (recipe_id) VALUES (?)', [recipeId]);
  }
}

// Upsert rule (§2.3): one row per recipe. never_again always overwrites
// not_tonight; not_tonight never overwrites an existing never_again.
export async function setExclusion(
  db: DbClient,
  recipeId: number,
  kind: 'never_again' | 'not_tonight',
  reason?: string,
): Promise<void> {
  const existing = await db.getFirstAsync<{ kind: string }>(
    'SELECT kind FROM recipe_exclusion WHERE recipe_id = ?',
    [recipeId],
  );
  if (existing?.kind === 'never_again' && kind === 'not_tonight') {
    logger.info('db', 'not_tonight ignored — never_again already set', { recipeId });
    return;
  }

  const expiresAt = kind === 'not_tonight' ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null;
  await db.runAsync(
    `INSERT INTO recipe_exclusion (recipe_id, kind, expires_at, reason)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(recipe_id) DO UPDATE SET kind = excluded.kind, expires_at = excluded.expires_at, reason = excluded.reason`,
    [recipeId, kind, expiresAt, reason ?? null],
  );
}

export async function clearExclusion(db: DbClient, recipeId: number): Promise<void> {
  await db.runAsync('DELETE FROM recipe_exclusion WHERE recipe_id = ?', [recipeId]);
}

// Bulk un-exclude (§5.4). Scoped to one kind on purpose: clearing tonight's
// dismissals must not also resurrect everything you swore off permanently.
// Returns how many rows went, so the caller can report it honestly.
export async function clearExclusionsOfKind(
  db: DbClient,
  kind: 'never_again' | 'not_tonight',
): Promise<number> {
  const result = await db.runAsync('DELETE FROM recipe_exclusion WHERE kind = ?', [kind]);
  logger.info('db', 'Exclusions cleared in bulk', { kind, cleared: result.changes });
  return result.changes;
}

export async function deleteRecipe(db: DbClient, recipeId: number): Promise<void> {
  await db.runAsync('DELETE FROM recipe WHERE id = ?', [recipeId]);
  await invalidateMedianCostCache(db);
}

// Copy-and-tweak (§9.4): new row, source='manual', seed_id=NULL, fresh
// share_id, name suffixed "(copy)", fully independent thereafter.
export async function copyRecipe(db: DbClient, recipeId: number): Promise<number> {
  const recipe = await db.getFirstAsync<{
    name: string;
    description: string | null;
    photo_emoji: string;
    base_servings: number;
    timeline_mode: string;
    origin_label: string | null;
    origin_url: string | null;
  }>('SELECT name, description, photo_emoji, base_servings, timeline_mode, origin_label, origin_url FROM recipe WHERE id = ?', [recipeId]);
  if (!recipe) throw new Error(`Recipe ${recipeId} not found`);

  const result = await db.runAsync(
    `INSERT INTO recipe (share_id, name, description, photo_emoji, base_servings, timeline_mode, source, origin_label, origin_url)
     VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, ?)`,
    [
      uuidv4(),
      `${recipe.name} (copy)`,
      recipe.description,
      recipe.photo_emoji,
      recipe.base_servings,
      recipe.timeline_mode,
      recipe.origin_label,
      recipe.origin_url,
    ],
  );
  const newRecipeId = result.lastInsertRowId;

  const lanes = await db.getAllAsync<{ id: number; name: string; sort_order: number }>(
    'SELECT id, name, sort_order FROM step_lane WHERE recipe_id = ? ORDER BY sort_order',
    [recipeId],
  );
  const laneIdMap = new Map<number, number>();
  for (const lane of lanes) {
    const laneResult = await db.runAsync('INSERT INTO step_lane (recipe_id, name, sort_order) VALUES (?, ?, ?)', [
      newRecipeId,
      lane.name,
      lane.sort_order,
    ]);
    laneIdMap.set(lane.id, laneResult.lastInsertRowId);
  }

  const ingredients = await db.getAllAsync<{
    canonical_id: number | null;
    display_name: string;
    quantity: number;
    unit: string;
    scalable: number;
    optional: number;
    sort_order: number;
  }>('SELECT canonical_id, display_name, quantity, unit, scalable, optional, sort_order FROM recipe_ingredient WHERE recipe_id = ? ORDER BY sort_order', [recipeId]);
  for (const ing of ingredients) {
    await db.runAsync(
      `INSERT INTO recipe_ingredient (recipe_id, canonical_id, display_name, quantity, unit, scalable, optional, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [newRecipeId, ing.canonical_id, ing.display_name, ing.quantity, ing.unit, ing.scalable, ing.optional, ing.sort_order],
    );
  }

  const steps = await db.getAllAsync<{
    lane_id: number | null;
    phase: string;
    instruction: string;
    duration_seconds: number | null;
    start_offset_seconds: number;
    effort: string;
    important: number;
    sort_order: number;
  }>('SELECT lane_id, phase, instruction, duration_seconds, start_offset_seconds, effort, important, sort_order FROM recipe_step WHERE recipe_id = ? ORDER BY sort_order', [recipeId]);
  for (const step of steps) {
    const mappedLaneId = step.lane_id != null ? laneIdMap.get(step.lane_id) ?? null : null;
    await db.runAsync(
      `INSERT INTO recipe_step (recipe_id, lane_id, phase, instruction, duration_seconds, start_offset_seconds, effort, important, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newRecipeId, mappedLaneId, step.phase, step.instruction, step.duration_seconds, step.start_offset_seconds, step.effort, step.important, step.sort_order],
    );
  }

  const tagIds = await db.getAllAsync<{ tag_id: number }>('SELECT tag_id FROM recipe_tag WHERE recipe_id = ?', [recipeId]);
  for (const { tag_id } of tagIds) {
    await db.runAsync('INSERT OR IGNORE INTO recipe_tag (recipe_id, tag_id) VALUES (?, ?)', [newRecipeId, tag_id]);
  }

  logger.info('db', 'Copied recipe', { fromId: recipeId, toId: newRecipeId });
  await invalidateMedianCostCache(db);
  return newRecipeId;
}
