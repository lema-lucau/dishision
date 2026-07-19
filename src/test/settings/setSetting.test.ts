import { describe, expect, it } from 'vitest';
import { createTestDb } from '../support/testDb';
import { getSetting } from '../../settings/getSetting';
import { setSetting } from '../../settings/setSetting';

describe('setSetting (§2.3)', () => {
  it('writes a new key that getSetting reads back', async () => {
    const db = await createTestDb();
    await setSetting(db, 'theme', 'seaglass');
    expect(await getSetting(db, 'theme')).toBe('seaglass');
  });

  it('upserts — a second write overwrites rather than duplicating', async () => {
    const db = await createTestDb();
    await setSetting(db, 'theme', 'hearth');
    await setSetting(db, 'theme', 'dusk');

    expect(await getSetting(db, 'theme')).toBe('dusk');
    const rows = await db.getAllAsync('SELECT * FROM setting WHERE key = ?', ['theme']);
    expect(rows).toHaveLength(1);
  });

  it('missing key reads back null', async () => {
    const db = await createTestDb();
    expect(await getSetting(db, 'theme')).toBeNull();
  });
});
