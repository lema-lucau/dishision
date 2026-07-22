// Sync log (§7 household): a human-readable history of sync events over the
// last N days, joined to member display names. Reads the sync_event table
// that runInitiator/runResponderSync already write to.
import type { DbClient } from '../db/DbClient';

export const SYNC_LOG_WINDOWS = [7, 14, 21, 30, 60] as const;
export type SyncLogWindow = (typeof SYNC_LOG_WINDOWS)[number];

export interface SyncLogEntry {
  id: number;
  personId: string;
  memberName: string;
  direction: 'sent' | 'received';
  kind: string;
  itemCount: number;
  createdAt: string;
}

export async function loadSyncLog(db: DbClient, windowDays: SyncLogWindow, now: Date = new Date()): Promise<SyncLogEntry[]> {
  const cutoff = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const rows = await db.getAllAsync<{
    id: number;
    person_id: string;
    member_name: string | null;
    direction: 'sent' | 'received';
    kind: string;
    item_count: number;
    created_at: string;
  }>(
    `SELECT se.id, se.person_id, hm.display_name AS member_name, se.direction, se.kind, se.item_count, se.created_at
     FROM sync_event se
     LEFT JOIN household_member hm ON hm.person_id = se.person_id
     WHERE se.created_at >= ?
     ORDER BY se.created_at DESC, se.id DESC`,
    [cutoff],
  );
  return rows.map((r) => ({
    id: r.id,
    personId: r.person_id,
    memberName: r.member_name ?? 'Unknown member',
    direction: r.direction,
    kind: r.kind,
    itemCount: r.item_count,
    createdAt: r.created_at,
  }));
}
