import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { getHouseholdMember } from '../../household/householdMutations';
import { handleIncomingConnection, initiatePairing, PairingRejectedError, type PairingSession } from '../../household/pairingProtocol';
import type { LocalIdentity } from '../../household/syncProtocol';
import { createChannelPair } from '../support/fakeSyncChannel';
import { createTestDb } from '../support/testDb';

const A: LocalIdentity = { personId: 'a-1', displayName: 'Lema', avatarEmoji: '🍜' };
const B: LocalIdentity = { personId: 'b-1', displayName: 'Tara', avatarEmoji: '🥑' };
const SESSION: PairingSession = { secret: 'freshly-minted-secret', code: '481923' };

describe('pairing protocol (§5.11)', () => {
  let aDb: DbClient;
  let bDb: DbClient;

  beforeEach(async () => {
    aDb = await createTestDb();
    bDb = await createTestDb();
  });

  it('QR path: B proves itself with the secret it read from the QR', async () => {
    const [aChannel, bChannel] = createChannelPair();
    const [, initiatorResult] = await Promise.all([
      handleIncomingConnection(aDb, aChannel, A, SESSION),
      initiatePairing(bChannel, B, { secret: SESSION.secret }),
    ]);

    expect(initiatorResult).toMatchObject({ personId: A.personId, displayName: A.displayName, secret: SESSION.secret });

    const onA = await getHouseholdMember(aDb, B.personId);
    expect(onA).toMatchObject({ displayName: 'Tara', syncSecret: SESSION.secret });
  });

  it('fallback code path: B proves itself with the 6-digit code, not the secret', async () => {
    const [aChannel, bChannel] = createChannelPair();
    const [, initiatorResult] = await Promise.all([
      handleIncomingConnection(aDb, aChannel, A, SESSION),
      initiatePairing(bChannel, B, { code: SESSION.code }),
    ]);

    // Both sides end up agreeing on the real secret, even though B never
    // typed it directly.
    expect(initiatorResult.secret).toBe(SESSION.secret);
    const onA = await getHouseholdMember(aDb, B.personId);
    expect(onA?.syncSecret).toBe(SESSION.secret);
  });

  it('rejects a wrong code/secret and writes nothing', async () => {
    const [aChannel, bChannel] = createChannelPair();
    const [, initiatorResult] = await Promise.allSettled([
      handleIncomingConnection(aDb, aChannel, A, SESSION),
      initiatePairing(bChannel, B, { code: '000000' }),
    ]);

    expect(initiatorResult.status).toBe('rejected');
    if (initiatorResult.status === 'rejected') {
      expect(initiatorResult.reason).toBeInstanceOf(PairingRejectedError);
    }
    expect(await getHouseholdMember(aDb, B.personId)).toBeNull();
  });

  it('rejects when no pairing session is active (screen not open)', async () => {
    const [aChannel, bChannel] = createChannelPair();
    const [, initiatorResult] = await Promise.allSettled([
      handleIncomingConnection(aDb, aChannel, A, null),
      initiatePairing(bChannel, B, { secret: SESSION.secret }),
    ]);
    expect(initiatorResult.status).toBe('rejected');
  });

  it('the dispatcher routes an already-paired member\'s regular hello to runResponderSync, not pairing', async () => {
    // Pre-pair B on A's side (simulating an already-completed pairing).
    const { upsertHouseholdMember } = await import('../../household/householdMutations');
    await upsertHouseholdMember(aDb, { personId: B.personId, displayName: B.displayName, avatarEmoji: B.avatarEmoji, syncSecret: SESSION.secret });

    const [aChannel, bChannel] = createChannelPair();
    const dispatcherPromise = handleIncomingConnection(aDb, aChannel, A, null); // no pairing session active, but that's fine for a regular sync
    await bChannel.send({ type: 'hello', personId: B.personId, secret: SESSION.secret });
    const ack = await bChannel.receive();
    expect(ack.type).toBe('hello_ack');
    // Drain the rest of the regular sync so the dispatcher promise settles.
    await bChannel.send({ type: 'profile', displayName: 'Tara', avatarEmoji: '🥑' });
    await bChannel.receive();
    await bChannel.send({ type: 'tombstone_check' });
    await bChannel.receive();
    await bChannel.send({ type: 'manifest_request' });
    await bChannel.receive();
    await bChannel.send({ type: 'payload_request', shareIds: [] });
    await bChannel.receive();
    await bChannel.send({ type: 'shared_cooks', entries: [] });
    await bChannel.receive(); // shared_cooks_ack
    await bChannel.send({ type: 'done' });
    await dispatcherPromise;
  });
});
