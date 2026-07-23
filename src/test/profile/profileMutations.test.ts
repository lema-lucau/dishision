import { describe, expect, it } from 'vitest';
import { createTestDb } from '../support/testDb';
import { ensureProfile, AVATAR_EMOJI_POOL } from '../../profile/ensureProfile';
import { clearAvatarPhoto, rerollAvatarEmoji, setAvatarPhoto, updateDisplayName } from '../../profile/profileMutations';

describe('profileMutations (§5.10)', () => {
  it('updateDisplayName writes the trimmed name', async () => {
    const db = await createTestDb();
    await ensureProfile(db, 'Lema');
    await updateDisplayName(db, '  Lema Renamed  ');

    const row = await db.getFirstAsync<{ display_name: string }>('SELECT display_name FROM profile WHERE id = 1');
    expect(row?.display_name).toBe('Lema Renamed');
  });

  it('updateDisplayName ignores a blank name (§1.1 no forced-empty)', async () => {
    const db = await createTestDb();
    await ensureProfile(db, 'Lema');
    await updateDisplayName(db, '   ');

    const row = await db.getFirstAsync<{ display_name: string }>('SELECT display_name FROM profile WHERE id = 1');
    expect(row?.display_name).toBe('Lema');
  });

  it('rerollAvatarEmoji returns a pool emoji that differs from the current one', async () => {
    const db = await createTestDb();
    const profile = await ensureProfile(db, 'Lema');

    // Re-roll many times; every result is in-pool and never the excluded one.
    for (let i = 0; i < 30; i++) {
      const next = await rerollAvatarEmoji(db, profile.avatar_emoji);
      expect(AVATAR_EMOJI_POOL).toContain(next);
      expect(next).not.toBe(profile.avatar_emoji);
      const row = await db.getFirstAsync<{ avatar_emoji: string }>('SELECT avatar_emoji FROM profile WHERE id = 1');
      expect(row?.avatar_emoji).toBe(next);
    }
  });

  it('setAvatarPhoto sets avatar_uri without touching avatar_emoji, clearAvatarPhoto reverts to it', async () => {
    const db = await createTestDb();
    const profile = await ensureProfile(db, 'Lema');

    await setAvatarPhoto(db, 'file:///avatar.jpg');
    let row = await db.getFirstAsync<{ avatar_uri: string | null; avatar_emoji: string }>('SELECT avatar_uri, avatar_emoji FROM profile WHERE id = 1');
    expect(row?.avatar_uri).toBe('file:///avatar.jpg');
    expect(row?.avatar_emoji).toBe(profile.avatar_emoji);

    await clearAvatarPhoto(db);
    row = await db.getFirstAsync('SELECT avatar_uri, avatar_emoji FROM profile WHERE id = 1');
    expect(row?.avatar_uri).toBeNull();
    expect(row?.avatar_emoji).toBe(profile.avatar_emoji);
  });
});
