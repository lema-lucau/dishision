import { describe, expect, it } from 'vitest';
import { createTestDb } from '../support/testDb';
import { ensureProfile, FOOD_EMOJI_POOL } from '../../profile/ensureProfile';
import { rerollAvatarEmoji, updateDisplayName } from '../../profile/profileMutations';

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
      expect(FOOD_EMOJI_POOL).toContain(next);
      expect(next).not.toBe(profile.avatar_emoji);
      const row = await db.getFirstAsync<{ avatar_emoji: string }>('SELECT avatar_emoji FROM profile WHERE id = 1');
      expect(row?.avatar_emoji).toBe(next);
    }
  });
});
