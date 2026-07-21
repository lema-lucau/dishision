// §5.11 pairing handshake, plus the incoming-connection dispatcher the
// listener uses to tell a first-time pairing attempt apart from a regular
// sync from an already-paired member (§7.5 step 0).
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { upsertHouseholdMember } from './householdMutations';
import { runResponderSync, type LocalIdentity } from './syncProtocol';
import type { SyncChannel, SyncMessage } from './syncTypes';

type PairHelloMessage = Extract<SyncMessage, { type: 'pair_hello' }>;

export interface PairingSession {
  secret: string;
  code: string;
}

export class PairingRejectedError extends Error {}

// The scanning/typing phone. `proof` is either the QR's secret (already
// known) or the fallback 6-digit code (not yet the real secret) — either
// way the responder replies with the one true secret it minted, so both
// sides end up agreeing on the same value regardless of which path was used.
export async function initiatePairing(
  channel: SyncChannel,
  me: LocalIdentity,
  proof: { secret?: string; code?: string },
): Promise<{ personId: string; displayName: string; avatarEmoji: string; secret: string }> {
  await channel.send({
    type: 'pair_hello',
    personId: me.personId,
    displayName: me.displayName,
    avatarEmoji: me.avatarEmoji,
    secret: proof.secret,
    code: proof.code,
  });
  const response = await channel.receive();
  channel.close();
  if (response.type === 'pair_reject') {
    throw new PairingRejectedError(response.reason);
  }
  if (response.type !== 'pair_accept') {
    throw new PairingRejectedError('Unexpected response');
  }
  return { personId: response.personId, displayName: response.displayName, avatarEmoji: response.avatarEmoji, secret: response.secret };
}

// The QR-displaying/listening phone's side of a pairing attempt.
async function respondToPairing(
  db: DbClient,
  channel: SyncChannel,
  me: LocalIdentity,
  hello: PairHelloMessage,
  session: PairingSession | null,
): Promise<void> {
  const valid = session != null && (hello.secret === session.secret || hello.code === session.code);
  if (!valid) {
    logger.warn('sync', 'Rejected pairing attempt: no active session or wrong proof', { personId: hello.personId });
    await channel.send({ type: 'pair_reject', reason: 'No active pairing session, or the code/link has expired.' });
    channel.close();
    return;
  }

  await upsertHouseholdMember(db, {
    personId: hello.personId,
    displayName: hello.displayName,
    avatarEmoji: hello.avatarEmoji,
    syncSecret: session.secret,
  });

  await channel.send({
    type: 'pair_accept',
    personId: me.personId,
    displayName: me.displayName,
    avatarEmoji: me.avatarEmoji,
    secret: session.secret,
  });
  channel.close();
  logger.info('sync', 'Paired with new household member', { personId: hello.personId });
}

// Every accepted connection lands here first. Peeks at the opening message
// to decide whether this is a brand-new pairing attempt or a regular sync
// from someone already in household_member.
export async function handleIncomingConnection(
  db: DbClient,
  channel: SyncChannel,
  me: LocalIdentity,
  activePairingSession: PairingSession | null,
): Promise<void> {
  const first = await channel.receive();
  if (first.type === 'pair_hello') {
    await respondToPairing(db, channel, me, first, activePairingSession);
    return;
  }
  if (first.type === 'hello') {
    await runResponderSync(db, channel, me, first);
    return;
  }
  channel.close();
}
