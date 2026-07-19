// §5.7/§5.2 leftover reads and mutations. A leftover past its expires_at
// simply stops appearing — no alert, no guilt (§1.1 no-nagging) — and is
// garbage-collected on app open rather than lingering forever.
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';

export interface LeftoverRow {
  id: number;
  cookLogId: number;
  recipeId: number;
  recipeName: string;
  photoEmoji: string;
  servingsRemaining: number;
  expiresAt: string;
  createdAt: string;
}

// Newest first (§5.2). Excludes anything already past expiry — expired rows
// are gone from every read path, not merely hidden.
export async function loadActiveLeftovers(db: DbClient, now: number = Date.now()): Promise<LeftoverRow[]> {
  const rows = await db.getAllAsync<{
    id: number;
    cook_log_id: number;
    recipe_id: number;
    recipe_name: string;
    photo_emoji: string;
    servings_remaining: number;
    expires_at: string;
    created_at: string;
  }>(
    `SELECT l.id, l.cook_log_id, cl.recipe_id, r.name as recipe_name, r.photo_emoji,
            l.servings_remaining, l.expires_at, l.created_at
     FROM leftover l
     JOIN cook_log cl ON cl.id = l.cook_log_id
     JOIN recipe r ON r.id = cl.recipe_id
     WHERE l.expires_at > ?
     ORDER BY l.created_at DESC`,
    [new Date(now).toISOString()],
  );
  return rows.map((r) => ({
    id: r.id,
    cookLogId: r.cook_log_id,
    recipeId: r.recipe_id,
    recipeName: r.recipe_name,
    photoEmoji: r.photo_emoji,
    servingsRemaining: r.servings_remaining,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  }));
}

// Silent expiry GC (§5.2, §5.7) — call on app open. Deletes rows whose
// expiry has already passed; never alerts, never blocks.
export async function gcExpiredLeftovers(db: DbClient, now: number = Date.now()): Promise<number> {
  const result = await db.runAsync('DELETE FROM leftover WHERE expires_at <= ?', [new Date(now).toISOString()]);
  if (result.changes > 0) logger.info('db', 'Garbage-collected expired leftovers', { count: result.changes });
  return result.changes;
}

// Eating decrements servings_remaining; reaching zero deletes the row (§5.2).
export async function eatLeftover(db: DbClient, leftoverId: number, servings: number): Promise<void> {
  const row = await db.getFirstAsync<{ servings_remaining: number }>(
    'SELECT servings_remaining FROM leftover WHERE id = ?',
    [leftoverId],
  );
  if (!row) return;
  const remaining = row.servings_remaining - servings;
  if (remaining <= 0) {
    await db.runAsync('DELETE FROM leftover WHERE id = ?', [leftoverId]);
  } else {
    await db.runAsync('UPDATE leftover SET servings_remaining = ?, updated_at = datetime(\'now\') WHERE id = ?', [
      remaining,
      leftoverId,
    ]);
  }
}

// Binning deletes the row outright, after the caller has confirmed (§5.2).
export async function binLeftover(db: DbClient, leftoverId: number): Promise<void> {
  await db.runAsync('DELETE FROM leftover WHERE id = ?', [leftoverId]);
}

export async function updateLeftoverExpiry(db: DbClient, leftoverId: number, expiresAt: string): Promise<void> {
  await db.runAsync('UPDATE leftover SET expires_at = ?, updated_at = datetime(\'now\') WHERE id = ?', [
    expiresAt,
    leftoverId,
  ]);
}
