import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { addCustomQuickTag, BUILT_IN_QUICK_TAGS, loadCustomQuickTags } from '../../cooking/quickTags';
import { createTestDb } from '../support/testDb';

describe('quick tag vocabulary (§5.9)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('starts empty — the built-ins are a separate constant, not stored', async () => {
    expect(await loadCustomQuickTags(db)).toEqual([]);
  });

  it('adds a new custom tag and it persists', async () => {
    await addCustomQuickTag(db, 'kids loved it');
    expect(await loadCustomQuickTags(db)).toEqual(['Kids loved it']);
  });

  it('capitalises the first letter and trims on add', async () => {
    await addCustomQuickTag(db, '  Freezer Friendly  ');
    expect(await loadCustomQuickTags(db)).toEqual(['Freezer Friendly']);
  });

  it('is a no-op for an empty/whitespace tag', async () => {
    await addCustomQuickTag(db, '   ');
    expect(await loadCustomQuickTags(db)).toEqual([]);
  });

  it('does not duplicate a tag that already exists, case-insensitively', async () => {
    await addCustomQuickTag(db, 'kids loved it');
    await addCustomQuickTag(db, 'Kids Loved It');
    expect(await loadCustomQuickTags(db)).toEqual(['Kids loved it']);
  });

  it('does not duplicate a built-in tag re-added as custom', async () => {
    await addCustomQuickTag(db, BUILT_IN_QUICK_TAGS[0].toUpperCase());
    expect(await loadCustomQuickTags(db)).toEqual([]);
  });

  it('accumulates multiple distinct custom tags in order', async () => {
    await addCustomQuickTag(db, 'freezer friendly');
    await addCustomQuickTag(db, 'kids loved it');
    expect(await loadCustomQuickTags(db)).toEqual(['Freezer friendly', 'Kids loved it']);
  });
});
