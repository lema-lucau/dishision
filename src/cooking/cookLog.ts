// §5.9 cook log CRUD. Counts, ratings, and streaks are never stored here or
// anywhere else (§2.5) — they're derived fresh from these rows every read.
import type { DbClient } from '../db/DbClient';

export interface CookLogDraft {
  recipeId: number;
  cookedAt: string;
  servingsMade: number;
  servingsEaten: number | null;
  stars: number | null;
  notes: string;
  whatWentWell: string;
  whatToChange: string;
  quickTags: string[];
  viaCookingMode: boolean;
  /** URIs already through the §8 compression pipeline — this module never compresses. */
  photos: string[];
}

export interface CookLogRow {
  id: number;
  recipeId: number;
  recipeName: string;
  photoEmoji: string;
  cookedAt: string;
  servingsMade: number;
  servingsEaten: number | null;
  stars: number | null;
  notes: string | null;
  whatWentWell: string | null;
  whatToChange: string | null;
  quickTags: string[];
  photos: string[];
  createdAt: string;
}

async function writeTags(db: DbClient, cookLogId: number, tags: string[]): Promise<void> {
  await db.runAsync('DELETE FROM cook_log_tag WHERE cook_log_id = ?', [cookLogId]);
  for (const tag of tags) {
    await db.runAsync('INSERT OR IGNORE INTO cook_log_tag (cook_log_id, tag) VALUES (?, ?)', [cookLogId, tag]);
  }
}

// Delete-and-reinsert, same shape as writeTags — sort_order just mirrors
// array order, there's no manual reordering UI (§5.9).
async function writePhotos(db: DbClient, cookLogId: number, photos: string[]): Promise<void> {
  await db.runAsync('DELETE FROM cook_log_photo WHERE cook_log_id = ?', [cookLogId]);
  for (let i = 0; i < photos.length; i++) {
    await db.runAsync('INSERT INTO cook_log_photo (cook_log_id, uri, sort_order) VALUES (?, ?, ?)', [cookLogId, photos[i], i]);
  }
}

export async function createCookLog(db: DbClient, draft: CookLogDraft): Promise<number> {
  await db.execAsync('BEGIN');
  try {
    const result = await db.runAsync(
      `INSERT INTO cook_log (recipe_id, cooked_at, servings_made, servings_eaten, stars, notes, what_went_well, what_to_change, via_cooking_mode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        draft.recipeId,
        draft.cookedAt,
        draft.servingsMade,
        draft.servingsEaten,
        draft.stars,
        draft.notes || null,
        draft.whatWentWell || null,
        draft.whatToChange || null,
        draft.viaCookingMode ? 1 : 0,
      ],
    );
    const id = result.lastInsertRowId;
    await writeTags(db, id, draft.quickTags);
    await writePhotos(db, id, draft.photos);
    await db.execAsync('COMMIT');
    return id;
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
}

export async function updateCookLog(db: DbClient, cookLogId: number, draft: CookLogDraft): Promise<void> {
  await db.execAsync('BEGIN');
  try {
    await db.runAsync(
      `UPDATE cook_log
       SET cooked_at = ?, servings_made = ?, servings_eaten = ?, stars = ?, notes = ?, what_went_well = ?, what_to_change = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [
        draft.cookedAt,
        draft.servingsMade,
        draft.servingsEaten,
        draft.stars,
        draft.notes || null,
        draft.whatWentWell || null,
        draft.whatToChange || null,
        cookLogId,
      ],
    );
    await writeTags(db, cookLogId, draft.quickTags);
    await writePhotos(db, cookLogId, draft.photos);
    await db.execAsync('COMMIT');
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
}

// Cascades to leftover/cook_log_tag/cook_log_photo/cook_log_substitution via
// ON DELETE CASCADE (§2.6) — deleting a log always takes its leftover with
// it, since a leftover with no owning cook is meaningless.
export async function deleteCookLog(db: DbClient, cookLogId: number): Promise<void> {
  await db.runAsync('DELETE FROM cook_log WHERE id = ?', [cookLogId]);
}

export interface CookLogFilter {
  logId?: number;
  recipeId?: number;
  dateFrom?: string;
  dateTo?: string;
  minStars?: number;
  /** AND logic — a log must carry every tag listed here (§5.4 multi-select filter convention). */
  tags?: string[];
}

export async function loadCookLogs(db: DbClient, filter: CookLogFilter = {}): Promise<CookLogRow[]> {
  const rows = await db.getAllAsync<{
    id: number;
    recipe_id: number;
    recipe_name: string;
    photo_emoji: string;
    cooked_at: string;
    servings_made: number;
    servings_eaten: number | null;
    stars: number | null;
    notes: string | null;
    what_went_well: string | null;
    what_to_change: string | null;
    created_at: string;
  }>(
    `SELECT cl.id, cl.recipe_id, r.name as recipe_name, r.photo_emoji, cl.cooked_at, cl.servings_made,
            cl.servings_eaten, cl.stars, cl.notes, cl.what_went_well, cl.what_to_change, cl.created_at
     FROM cook_log cl
     JOIN recipe r ON r.id = cl.recipe_id
     WHERE cl.completed = 1
       AND (? IS NULL OR cl.id = ?)
       AND (? IS NULL OR cl.recipe_id = ?)
       AND (? IS NULL OR cl.cooked_at >= ?)
       AND (? IS NULL OR cl.cooked_at <= ?)
       AND (? IS NULL OR cl.stars >= ?)
     ORDER BY cl.cooked_at DESC`,
    [
      filter.logId ?? null,
      filter.logId ?? null,
      filter.recipeId ?? null,
      filter.recipeId ?? null,
      filter.dateFrom ?? null,
      filter.dateFrom ?? null,
      filter.dateTo ?? null,
      filter.dateTo ?? null,
      filter.minStars ?? null,
      filter.minStars ?? null,
    ],
  );

  const tagRows = await db.getAllAsync<{ cook_log_id: number; tag: string }>(
    'SELECT cook_log_id, tag FROM cook_log_tag',
  );
  const tagsByLog = new Map<number, string[]>();
  for (const t of tagRows) {
    const list = tagsByLog.get(t.cook_log_id) ?? [];
    list.push(t.tag);
    tagsByLog.set(t.cook_log_id, list);
  }

  const photoRows = await db.getAllAsync<{ cook_log_id: number; uri: string }>(
    'SELECT cook_log_id, uri FROM cook_log_photo ORDER BY sort_order',
  );
  const photosByLog = new Map<number, string[]>();
  for (const p of photoRows) {
    const list = photosByLog.get(p.cook_log_id) ?? [];
    list.push(p.uri);
    photosByLog.set(p.cook_log_id, list);
  }

  const mapped = rows.map((r) => ({
    id: r.id,
    recipeId: r.recipe_id,
    recipeName: r.recipe_name,
    photoEmoji: r.photo_emoji,
    cookedAt: r.cooked_at,
    servingsMade: r.servings_made,
    servingsEaten: r.servings_eaten,
    stars: r.stars,
    notes: r.notes,
    whatWentWell: r.what_went_well,
    whatToChange: r.what_to_change,
    quickTags: tagsByLog.get(r.id) ?? [],
    photos: photosByLog.get(r.id) ?? [],
    createdAt: r.created_at,
  }));

  return filter.tags?.length ? mapped.filter((r) => filter.tags!.every((t) => r.quickTags.includes(t))) : mapped;
}
