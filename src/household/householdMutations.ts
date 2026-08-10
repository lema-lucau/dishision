// §5.11 household member CRUD + §2.4 recipe visibility. Pure DB logic —
// pairing's QR/crypto glue lives in syncSecret.ts and PairingScreen.tsx.
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { markHouseholdDirty } from './autoSync';

export interface HouseholdMember {
  personId: string;
  displayName: string;
  avatarUri: string | null;
  avatarEmoji: string;
  syncSecret: string;
  lastKnownAddress: string | null;
  addedAt: string;
  lastSyncedAt: string | null;
  removedAt: string | null;
}

interface HouseholdMemberRow {
  person_id: string;
  display_name: string;
  avatar_uri: string | null;
  avatar_emoji: string;
  sync_secret: string;
  last_known_address: string | null;
  added_at: string;
  last_synced_at: string | null;
  removed_at: string | null;
}

function fromRow(row: HouseholdMemberRow): HouseholdMember {
  return {
    personId: row.person_id,
    displayName: row.display_name,
    avatarUri: row.avatar_uri,
    avatarEmoji: row.avatar_emoji,
    syncSecret: row.sync_secret,
    lastKnownAddress: row.last_known_address,
    addedAt: row.added_at,
    lastSyncedAt: row.last_synced_at,
    removedAt: row.removed_at,
  };
}

export async function listHouseholdMembers(db: DbClient, opts: { includeRemoved?: boolean } = {}): Promise<HouseholdMember[]> {
  const rows = await db.getAllAsync<HouseholdMemberRow>(
    opts.includeRemoved
      ? 'SELECT * FROM household_member ORDER BY added_at'
      : 'SELECT * FROM household_member WHERE removed_at IS NULL ORDER BY added_at',
  );
  return rows.map(fromRow);
}

export async function getHouseholdMember(db: DbClient, personId: string): Promise<HouseholdMember | null> {
  const row = await db.getFirstAsync<HouseholdMemberRow>('SELECT * FROM household_member WHERE person_id = ?', [personId]);
  return row ? fromRow(row) : null;
}

// Pairing writes this row on both sides (§5.11 handshake). Upsert so
// re-pairing (a new secret after a re-install) overwrites cleanly rather
// than colliding on the PRIMARY KEY.
export async function upsertHouseholdMember(
  db: DbClient,
  member: Pick<HouseholdMember, 'personId' | 'displayName' | 'avatarEmoji' | 'syncSecret'> & Partial<Pick<HouseholdMember, 'avatarUri' | 'lastKnownAddress'>>,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO household_member (person_id, display_name, avatar_uri, avatar_emoji, sync_secret, last_known_address)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(person_id) DO UPDATE SET
       display_name = excluded.display_name,
       avatar_uri = excluded.avatar_uri,
       avatar_emoji = excluded.avatar_emoji,
       sync_secret = excluded.sync_secret,
       last_known_address = COALESCE(excluded.last_known_address, household_member.last_known_address),
       removed_at = NULL`,
    [member.personId, member.displayName, member.avatarUri ?? null, member.avatarEmoji, member.syncSecret, member.lastKnownAddress ?? null],
  );
  logger.info('sync', 'Paired with household member', { personId: member.personId, displayName: member.displayName });
}

// §5.11: "Removal is local and immediate: sets removed_at, cascades the
// recipe cache and ratings away." The member row itself is a tombstone,
// not deleted — it has to survive so the next contact attempt can still
// authenticate long enough to report "you removed me" (§7.5 step 3).
export async function removeHouseholdMember(db: DbClient, personId: string): Promise<void> {
  await db.execAsync('BEGIN');
  try {
    await db.runAsync("UPDATE household_member SET removed_at = datetime('now') WHERE person_id = ?", [personId]);
    await db.runAsync('DELETE FROM household_recipe_cache WHERE person_id = ?', [personId]);
    await db.runAsync('DELETE FROM household_rating WHERE person_id = ?', [personId]);
    await db.execAsync('COMMIT');
    logger.info('sync', 'Removed household member', { personId });
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
}

export async function updateLastKnownAddress(db: DbClient, personId: string, address: string): Promise<void> {
  await db.runAsync('UPDATE household_member SET last_known_address = ? WHERE person_id = ?', [address, personId]);
}

export async function updateMemberProfile(db: DbClient, personId: string, displayName: string, avatarEmoji: string): Promise<void> {
  await db.runAsync('UPDATE household_member SET display_name = ?, avatar_emoji = ? WHERE person_id = ?', [
    displayName,
    avatarEmoji,
    personId,
  ]);
}

export async function markSynced(db: DbClient, personId: string): Promise<void> {
  await db.runAsync("UPDATE household_member SET last_synced_at = datetime('now') WHERE person_id = ?", [personId]);
}

// §2.4: visibility is always a deliberate per-recipe act, never bulk.
export async function setRecipeVisibility(db: DbClient, recipeId: number, visibility: 'private' | 'public'): Promise<void> {
  await db.runAsync("UPDATE recipe SET visibility = ?, updated_at = datetime('now') WHERE id = ?", [visibility, recipeId]);
  logger.info('db', 'Recipe visibility changed', { recipeId, visibility });
  markHouseholdDirty(); // §E: a recipe becoming public/private is worth syncing
}

export async function countRecipeVisibility(db: DbClient): Promise<{ total: number; public: number }> {
  const row = await db.getFirstAsync<{ total: number; pub: number }>(
    `SELECT COUNT(*) as total, SUM(CASE WHEN visibility = 'public' THEN 1 ELSE 0 END) as pub FROM recipe`,
  );
  return { total: row?.total ?? 0, public: row?.pub ?? 0 };
}
