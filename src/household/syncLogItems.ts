// §B6: per-item sync detail. sync_event says a sync happened; these rows say
// what was in it — the recipes, ratings, and cooks that crossed — so the sync
// log can list them and link to the recipes involved.
import type { DbClient } from '../db/DbClient';

export type SyncItemType = 'recipe' | 'rating' | 'cook_log';
export type SyncItemAction = 'added' | 'updated' | 'skipped' | 'sent' | 'received';

export interface SyncItemInput {
  itemType: SyncItemType;
  action: SyncItemAction;
  /** Local library recipe this points at, if we have it — the navigation target. */
  recipeId: number | null;
  shareId: string | null;
  nameSnapshot: string;
  /** Free extra: a rating value, a cook date, etc. */
  detail: string | null;
}

export async function writeSyncItems(db: DbClient, syncEventId: number, items: SyncItemInput[]): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    await db.runAsync(
      `INSERT INTO sync_log_item (sync_event_id, item_type, action, recipe_id, share_id, name_snapshot, detail, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [syncEventId, it.itemType, it.action, it.recipeId, it.shareId, it.nameSnapshot, it.detail, i],
    );
  }
}

export interface SyncLogItemRow {
  id: number;
  itemType: SyncItemType;
  action: SyncItemAction;
  /** Non-null only when the local recipe still exists (ON DELETE SET NULL) — so
   * this doubles as "is this still navigable / available". */
  recipeId: number | null;
  shareId: string | null;
  nameSnapshot: string;
  detail: string | null;
}

export async function loadSyncLogItems(db: DbClient, syncEventId: number): Promise<SyncLogItemRow[]> {
  const rows = await db.getAllAsync<{
    id: number;
    item_type: SyncItemType;
    action: SyncItemAction;
    recipe_id: number | null;
    share_id: string | null;
    name_snapshot: string;
    detail: string | null;
  }>(
    `SELECT id, item_type, action, recipe_id, share_id, name_snapshot, detail
       FROM sync_log_item WHERE sync_event_id = ? ORDER BY item_type, sort_order`,
    [syncEventId],
  );
  return rows.map((r) => ({
    id: r.id,
    itemType: r.item_type,
    action: r.action,
    recipeId: r.recipe_id,
    shareId: r.share_id,
    nameSnapshot: r.name_snapshot,
    detail: r.detail,
  }));
}

// Resolve the local library recipe id for a share_id, if this device has it —
// used so a synced item can link to the recipe when we own a copy.
export async function localRecipeIdForShareId(db: DbClient, shareId: string): Promise<number | null> {
  const row = await db.getFirstAsync<{ id: number }>('SELECT id FROM recipe WHERE share_id = ?', [shareId]);
  return row?.id ?? null;
}
