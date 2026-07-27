// §7.5 sync protocol: connecting phone (initiator) pulls the listening
// phone's (responder's) public recipes. A full mutual sync is two
// one-directional pulls — Tara syncing from me is a separate act from me
// syncing from Tara — which matches "no background sync, every sync is a
// deliberate, foregrounded act" and "the cache is read-only... their phone
// is the sole authority on their recipes."
//
// Every message after `hello` should carry the shared secret in principle;
// in practice the responder validates once at `hello` and closes the
// connection immediately on failure (§7.5 — "a missing or wrong secret →
// connection closed immediately"), so nothing past that point is
// unauthenticated traffic on an open connection.
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { buildSharePayload } from '../sharing/payload';
import { getHouseholdMember, markSynced, removeHouseholdMember, updateMemberProfile, upsertHouseholdMember } from './householdMutations';
import { applyReceivedRatings, listMyPublicRatings } from './opinionSync';
import { applyReceivedSharedCooks, listPendingSharedCooks, markSharedCooksSynced } from './sharedCooks';
import { deleteVanishedCacheRows, upsertHouseholdCacheEntry } from './syncCache';
import { SyncAuthError, type ManifestItem, type PayloadEntry, type SyncChannel, type SyncMessage } from './syncTypes';

export interface LocalIdentity {
  personId: string;
  displayName: string;
  avatarEmoji: string;
}

async function writeSyncEvent(db: DbClient, personId: string, direction: 'sent' | 'received', kind: string, itemCount: number): Promise<void> {
  await db.runAsync('INSERT INTO sync_event (person_id, direction, kind, item_count) VALUES (?, ?, ?, ?)', [
    personId,
    direction,
    kind,
    itemCount,
  ]);
}

export interface InitiatorSyncResult {
  droppedByPeer: boolean;
  recipesReceived: number;
  recipesRemoved: number;
  /** Queued cooks pushed to the peer that they accepted as cook logs. */
  sharedCooksPushed: number;
}

// The phone that tapped "Sync now" — connects out, pulls the peer's public
// library into household_recipe_cache (§7.5 steps 1-8).
export async function runInitiatorSync(
  db: DbClient,
  channel: SyncChannel,
  me: LocalIdentity,
  peerPersonId: string,
  sharedSecret: string,
): Promise<InitiatorSyncResult> {
  await channel.send({ type: 'hello', personId: me.personId, secret: sharedSecret });
  const ack = await channel.receive();
  if (ack.type !== 'hello_ack') {
    logger.warn('sync', 'Sync rejected by peer (bad secret or peer not paired)', { peerPersonId });
    throw new SyncAuthError('Peer rejected the connection');
  }

  await channel.send({ type: 'profile', displayName: me.displayName, avatarEmoji: me.avatarEmoji });
  const theirProfile = await channel.receive();
  if (theirProfile.type === 'profile') {
    await updateMemberProfile(db, peerPersonId, theirProfile.displayName, theirProfile.avatarEmoji);
  }

  await channel.send({ type: 'tombstone_check' });
  const tombstone = await channel.receive();
  if (tombstone.type === 'tombstone' && tombstone.removed) {
    logger.info('sync', 'Peer has removed us from their household — dropping them locally too', { peerPersonId });
    await removeHouseholdMember(db, peerPersonId);
    channel.close();
    return { droppedByPeer: true, recipesReceived: 0, recipesRemoved: 0, sharedCooksPushed: 0 };
  }

  await channel.send({ type: 'manifest_request' });
  const manifestMsg = await channel.receive();
  const manifest: ManifestItem[] = manifestMsg.type === 'manifest' ? manifestMsg.items : [];

  // Full refresh rather than a delta: household_recipe_cache has no stored
  // per-row "their updated_at" to diff against (only our own synced_at),
  // and syncs are infrequent/manual/local-network, so re-fetching every
  // manifested recipe is a deliberate simplicity-over-bandwidth call.
  const shareIds = manifest.map((m) => m.shareId);
  await channel.send({ type: 'payload_request', shareIds });
  const payloadMsg = await channel.receive();
  const entries: PayloadEntry[] = payloadMsg.type === 'payload' ? payloadMsg.entries : [];

  // Push cooks queued for this peer — they land as cook logs on their side.
  const pendingCooks = await listPendingSharedCooks(db, peerPersonId);
  await channel.send({
    type: 'shared_cooks',
    entries: pendingCooks.map((c) => ({
      recipeShareId: c.recipeShareId,
      recipeName: c.recipeName,
      cookedAt: c.cookedAt,
      servingsMade: c.servingsMade,
      servingsEaten: c.servingsEaten,
      stars: c.stars,
      notes: c.notes,
    })),
  });
  const cookAck = await channel.receive();
  const sharedCooksPushed = cookAck.type === 'shared_cooks_ack' ? cookAck.applied : 0;

  await channel.send({ type: 'done' });
  channel.close();

  // §7.5 atomicity: steps 6-8 staged and committed in one transaction —
  // nothing above this line has written to household_recipe_cache, so a
  // failure anywhere in the network exchange leaves the previous cache
  // byte-identical.
  await db.execAsync('BEGIN');
  try {
    for (const entry of entries) {
      await upsertHouseholdCacheEntry(db, peerPersonId, entry);
    }
    const removed = await deleteVanishedCacheRows(db, peerPersonId, shareIds);
    await writeSyncEvent(db, peerPersonId, 'received', 'recipes', entries.length);
    // Cooks were delivered to the peer (accepted or not, re-pushing won't help),
    // so clear them from the outbox and record what they accepted.
    if (pendingCooks.length > 0) {
      await markSharedCooksSynced(db, pendingCooks.map((c) => c.id));
      await writeSyncEvent(db, peerPersonId, 'sent', 'shared_cooks', sharedCooksPushed);
    }
    await markSynced(db, peerPersonId);
    await db.execAsync('COMMIT');
    logger.info('sync', 'Sync complete', { peerPersonId, received: entries.length, removed, sharedCooksPushed });
    return { droppedByPeer: false, recipesReceived: entries.length, recipesRemoved: removed, sharedCooksPushed };
  } catch (error) {
    await db.execAsync('ROLLBACK');
    logger.error('sync', 'Sync failed during commit — cache left untouched', { peerPersonId, error: String(error) });
    throw error;
  }
}

// Deliberately does NOT treat a local removed_at tombstone as an auth
// failure: a removed peer must still be able to connect far enough to be
// told "you've been removed" (§7.5 step 3) — the secret itself doesn't
// change on removal, only on re-pairing, so it's still the right check.
async function validateSecret(db: DbClient, personId: string, secret: string): Promise<boolean> {
  const member = await getHouseholdMember(db, personId);
  if (!member) return false;
  return member.syncSecret === secret;
}

async function listPublicManifest(db: DbClient): Promise<ManifestItem[]> {
  const rows = await db.getAllAsync<{ share_id: string; updated_at: string }>(
    "SELECT share_id, updated_at FROM recipe WHERE visibility = 'public'",
  );
  return rows.map((r) => ({ shareId: r.share_id, updatedAt: r.updated_at }));
}

async function buildPayloadEntries(db: DbClient, shareIds: string[]): Promise<PayloadEntry[]> {
  const entries: PayloadEntry[] = [];
  for (const shareId of shareIds) {
    // Re-check visibility here, not just trust the manifest we handed out
    // moments ago — never serve a payload for a recipe that isn't public,
    // even if a stale/forged request asks for it.
    const recipe = await db.getFirstAsync<{ id: number }>("SELECT id FROM recipe WHERE share_id = ? AND visibility = 'public'", [shareId]);
    if (!recipe) continue;
    const payload = await buildSharePayload(db, recipe.id, { includePhoto: false });
    const favourite = await db.getFirstAsync<{ created_at: string }>('SELECT created_at FROM favourite WHERE recipe_id = ?', [recipe.id]);
    entries.push({ shareId, payload, isFavourite: favourite != null, favouritedAt: favourite?.created_at ?? null });
  }
  return entries;
}

// The listening phone. Runs once per accepted connection — validates the
// opening hello, then serves whatever the initiator asks for. Never writes
// anything to household_recipe_cache/rating of its own (it's not pulling
// anything); the only local write is the initiator's profile (harmless,
// same trust level as the rest of the household_member row).
export async function runResponderSync(
  db: DbClient,
  channel: SyncChannel,
  me: LocalIdentity,
  /** Pass this when the caller already consumed the opening message while
   * dispatching between pairing and regular sync (pairingProtocol.ts). */
  prefetchedHello?: SyncMessage,
): Promise<void> {
  const hello = prefetchedHello ?? (await channel.receive());
  if (hello.type !== 'hello') {
    channel.close();
    return;
  }
  const authenticated = await validateSecret(db, hello.personId, hello.secret);
  if (!authenticated) {
    logger.warn('sync', 'Rejected sync attempt: missing or wrong secret', { personId: hello.personId });
    await writeSyncEvent(db, hello.personId, 'received', 'auth_rejected', 0);
    channel.close();
    return;
  }

  await channel.send({ type: 'hello_ack', personId: me.personId });

  const theirProfileMsg = await channel.receive();
  if (theirProfileMsg.type === 'profile') {
    await updateMemberProfile(db, hello.personId, theirProfileMsg.displayName, theirProfileMsg.avatarEmoji);
  }
  await channel.send({ type: 'profile', displayName: me.displayName, avatarEmoji: me.avatarEmoji });

  await channel.receive(); // tombstone_check
  const iRemovedThem = (await getHouseholdMember(db, hello.personId))?.removedAt != null;
  await channel.send({ type: 'tombstone', removed: iRemovedThem });
  if (iRemovedThem) {
    channel.close();
    return;
  }

  await channel.receive(); // manifest_request
  const manifest = await listPublicManifest(db);
  await channel.send({ type: 'manifest', items: manifest });

  const requestMsg = await channel.receive();
  const requested = requestMsg.type === 'payload_request' ? requestMsg.shareIds : [];
  const entries = await buildPayloadEntries(db, requested);
  await channel.send({ type: 'payload', entries });
  await writeSyncEvent(db, hello.personId, 'sent', 'recipes', entries.length);

  // Receive cooks the peer logged "with" us and record them as our own cook
  // logs (matched to our recipe by share_id; unknown recipes are skipped).
  const cooksMsg = await channel.receive();
  const incomingCooks = cooksMsg.type === 'shared_cooks' ? cooksMsg.entries : [];
  const { applied, skipped } = await applyReceivedSharedCooks(db, incomingCooks);
  await channel.send({ type: 'shared_cooks_ack', applied: applied.length, skipped });
  if (applied.length > 0) {
    await writeSyncEvent(db, hello.personId, 'received', 'shared_cooks', applied.length);
  }

  await channel.receive(); // done
  channel.close();
}

export interface RatingsSendResult {
  ratingsSent: number;
}

// §7.6 Send my ratings — the initiator. A separate connection from a recipe
// sync (opinions cross only on an explicit send, never as a side effect,
// §15). Pushes {share_id, stars} for every public rated recipe and nothing
// else. One-directional: the peer stores, acks the count, and sends nothing
// back of its own.
export async function runRatingsInitiator(
  db: DbClient,
  channel: SyncChannel,
  me: LocalIdentity,
  peerPersonId: string,
  sharedSecret: string,
): Promise<RatingsSendResult> {
  await channel.send({ type: 'ratings_hello', personId: me.personId, secret: sharedSecret });
  const ack = await channel.receive();
  if (ack.type !== 'ratings_hello_ack') {
    logger.warn('sync', 'Ratings send rejected by peer (bad secret or not paired)', { peerPersonId });
    throw new SyncAuthError('Peer rejected the connection');
  }

  const ratings = await listMyPublicRatings(db);
  await channel.send({ type: 'ratings', entries: ratings });
  const result = await channel.receive();
  const stored = result.type === 'ratings_ack' ? result.stored : 0;

  await channel.send({ type: 'done' });
  channel.close();

  await writeSyncEvent(db, peerPersonId, 'sent', 'ratings', ratings.length);
  logger.info('sync', 'Sent ratings', { peerPersonId, sent: ratings.length, storedByPeer: stored });
  return { ratingsSent: ratings.length };
}

// §7.6 the receiving side. Validates the secret exactly like the recipe-sync
// responder, then upserts the incoming ratings under the initiator's
// person_id. Orphan ratings (no matching local recipe) are kept, not dropped
// (opinionSync.applyReceivedRatings).
export async function runRatingsResponder(
  db: DbClient,
  channel: SyncChannel,
  /** Passed when the incoming-connection dispatcher already consumed the
   * opening message (pairingProtocol.ts). */
  prefetchedHello?: SyncMessage,
): Promise<void> {
  const hello = prefetchedHello ?? (await channel.receive());
  if (hello.type !== 'ratings_hello') {
    channel.close();
    return;
  }
  const authenticated = await validateSecret(db, hello.personId, hello.secret);
  if (!authenticated) {
    logger.warn('sync', 'Rejected ratings send: missing or wrong secret', { personId: hello.personId });
    await writeSyncEvent(db, hello.personId, 'received', 'auth_rejected', 0);
    channel.close();
    return;
  }

  await channel.send({ type: 'ratings_hello_ack', personId: hello.personId });

  const ratingsMsg = await channel.receive();
  const entries = ratingsMsg.type === 'ratings' ? ratingsMsg.entries : [];

  // §7.6 is inherently atomic-enough (a single upsert per row, idempotent on
  // re-send), but wrap it so a mid-batch failure can't leave a half-applied
  // snapshot.
  await db.execAsync('BEGIN');
  let stored = 0;
  try {
    stored = await applyReceivedRatings(db, hello.personId, entries);
    await writeSyncEvent(db, hello.personId, 'received', 'ratings', stored);
    await db.execAsync('COMMIT');
  } catch (error) {
    await db.execAsync('ROLLBACK');
    logger.error('sync', 'Storing ratings failed — nothing committed', { personId: hello.personId, error: String(error) });
    channel.close();
    return;
  }

  await channel.send({ type: 'ratings_ack', stored });
  await channel.receive(); // done
  channel.close();
}

// Convenience for pairing (§5.11): registers or refreshes the member row.
export async function completePairing(
  db: DbClient,
  member: { personId: string; displayName: string; avatarEmoji: string; syncSecret: string; address?: string },
): Promise<void> {
  await upsertHouseholdMember(db, member);
}
