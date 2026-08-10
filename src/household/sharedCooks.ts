// Shared cooks (§7 household): queueing cooks to push to a member, and
// applying cooks received from a member as local cook_log rows. Pure DB — the
// wire transport lives in syncProtocol.ts.
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { markHouseholdDirty } from './autoSync';

export interface SharedCookEntry {
  recipeShareId: string;
  recipeName: string;
  cookedAt: string;
  servingsMade: number;
  servingsEaten: number;
  stars: number | null;
  notes: string | null;
}

export interface QueuedSharedCook extends SharedCookEntry {
  id: number;
  recipientPersonId: string;
}

// Queue a cook to be shared with one member. Stored locally until the next
// successful sync to that member (the offline queue).
export async function queueSharedCook(db: DbClient, recipientPersonId: string, cook: SharedCookEntry): Promise<void> {
  await db.runAsync(
    `INSERT INTO shared_cook_outbox
       (recipient_person_id, recipe_share_id, recipe_name, cooked_at, servings_made, servings_eaten, stars, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      recipientPersonId,
      cook.recipeShareId,
      cook.recipeName,
      cook.cookedAt,
      cook.servingsMade,
      cook.servingsEaten,
      cook.stars,
      cook.notes,
    ],
  );
  logger.info('sync', 'Queued shared cook', { recipientPersonId, recipe: cook.recipeName });
  markHouseholdDirty(); // §E: a queued shared cook should push on the next cycle
}

export async function listPendingSharedCooks(db: DbClient, recipientPersonId: string): Promise<QueuedSharedCook[]> {
  const rows = await db.getAllAsync<{
    id: number;
    recipient_person_id: string;
    recipe_share_id: string;
    recipe_name: string;
    cooked_at: string;
    servings_made: number;
    servings_eaten: number;
    stars: number | null;
    notes: string | null;
  }>(
    'SELECT * FROM shared_cook_outbox WHERE recipient_person_id = ? AND synced_at IS NULL ORDER BY created_at',
    [recipientPersonId],
  );
  return rows.map((r) => ({
    id: r.id,
    recipientPersonId: r.recipient_person_id,
    recipeShareId: r.recipe_share_id,
    recipeName: r.recipe_name,
    cookedAt: r.cooked_at,
    servingsMade: r.servings_made,
    servingsEaten: r.servings_eaten,
    stars: r.stars,
    notes: r.notes,
  }));
}

export async function markSharedCooksSynced(db: DbClient, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(`UPDATE shared_cook_outbox SET synced_at = datetime('now') WHERE id IN (${placeholders})`, ids);
}

export interface AppliedSharedCook {
  recipeName: string;
  cookLogId: number;
}

// Apply cooks received from a member: each becomes a cook_log against the
// recipient's own recipe matched by share_id. A cook for a recipe the
// recipient doesn't have is skipped (a cook_log needs a real recipe row) and
// reported back, so nothing is silently invented.
export async function applyReceivedSharedCooks(
  db: DbClient,
  entries: SharedCookEntry[],
): Promise<{ applied: AppliedSharedCook[]; skipped: number }> {
  const applied: AppliedSharedCook[] = [];
  let skipped = 0;
  for (const entry of entries) {
    const recipe = await db.getFirstAsync<{ id: number }>('SELECT id FROM recipe WHERE share_id = ?', [entry.recipeShareId]);
    if (!recipe) {
      skipped += 1;
      continue;
    }
    const result = await db.runAsync(
      `INSERT INTO cook_log (recipe_id, cooked_at, servings_made, servings_eaten, stars, notes, via_cooking_mode)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [recipe.id, entry.cookedAt, entry.servingsMade, entry.servingsEaten, entry.stars, entry.notes],
    );
    applied.push({ recipeName: entry.recipeName, cookLogId: result.lastInsertRowId });
  }
  if (applied.length > 0 || skipped > 0) {
    logger.info('sync', 'Applied received shared cooks', { applied: applied.length, skipped });
  }
  return { applied, skipped };
}
