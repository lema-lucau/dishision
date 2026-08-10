import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { getHouseholdMember, upsertHouseholdMember } from '../../household/householdMutations';
import { persistPeerAddress } from '../../household/syncProtocol';
import { createTestDb } from '../support/testDb';

describe('persistPeerAddress (§E address re-exchange)', () => {
  let db: DbClient;
  beforeEach(async () => {
    db = await createTestDb();
    await upsertHouseholdMember(db, {
      personId: 'p1',
      displayName: 'Tara',
      avatarEmoji: '🦊',
      syncSecret: 'secret',
      lastKnownAddress: '192.168.1.10:51830',
    });
  });

  it('updates a member address when a fresh one is advertised', async () => {
    await persistPeerAddress(db, 'p1', '192.168.1.55:51830');
    expect((await getHouseholdMember(db, 'p1'))?.lastKnownAddress).toBe('192.168.1.55:51830');
  });

  it('leaves the stored address untouched when none is advertised', async () => {
    await persistPeerAddress(db, 'p1', null);
    await persistPeerAddress(db, 'p1', undefined);
    await persistPeerAddress(db, 'p1', '   ');
    expect((await getHouseholdMember(db, 'p1'))?.lastKnownAddress).toBe('192.168.1.10:51830');
  });

  it('trims a whitespace-padded address before storing', async () => {
    await persistPeerAddress(db, 'p1', '  10.0.0.2:51830  ');
    expect((await getHouseholdMember(db, 'p1'))?.lastKnownAddress).toBe('10.0.0.2:51830');
  });
});
