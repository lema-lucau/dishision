import { describe, expect, it } from 'vitest';
import { createTestDb } from '../support/testDb';
import { ensureProfile, AVATAR_EMOJI_POOL } from '../../profile/ensureProfile';

describe('ensureProfile', () => {
  it('creates a single profile row on first run with a person_id and pool emoji', async () => {
    const db = await createTestDb();
    const profile = await ensureProfile(db, 'Lema');

    expect(profile.id).toBe(1);
    expect(profile.display_name).toBe('Lema');
    expect(profile.person_id).toEqual(expect.any(String));
    expect(profile.person_id.length).toBeGreaterThan(0);
    expect(AVATAR_EMOJI_POOL).toContain(profile.avatar_emoji);
  });

  it('is idempotent — a second call returns the same row untouched', async () => {
    const db = await createTestDb();
    const first = await ensureProfile(db, 'Lema');
    const second = await ensureProfile(db, 'A different name');

    expect(second.id).toBe(first.id);
    expect(second.person_id).toBe(first.person_id);
    expect(second.avatar_emoji).toBe(first.avatar_emoji);
    expect(second.display_name).toBe('Lema');

    const rows = await db.getAllAsync('SELECT * FROM profile');
    expect(rows).toHaveLength(1);
  });
});
