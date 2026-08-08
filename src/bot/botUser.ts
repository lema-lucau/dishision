// The device owner's display name, for the system prompt's {{USER_NAME}} (§7.3).
// Reads the single profile row directly; falls back to a neutral name.
import type { DbClient } from '../db/DbClient';

export async function getUserName(db: DbClient): Promise<string> {
  const row = await db.getFirstAsync<{ display_name: string }>('SELECT display_name FROM profile WHERE id = 1');
  return row?.display_name?.trim() || 'you';
}
