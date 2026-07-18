import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { getCurrencySymbol, getSetting, getSettingWithDefault } from '../../settings/getSetting';
import { createTestDb } from '../support/testDb';

describe('setting reads (§2.3, §5.10)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('returns null for a key that has never been written', async () => {
    expect(await getSetting(db, 'currency_symbol')).toBeNull();
  });

  it('returns the stored value once written', async () => {
    await db.runAsync('INSERT INTO setting (key, value) VALUES (?, ?)', ['currency_symbol', '$']);
    expect(await getSetting(db, 'currency_symbol')).toBe('$');
  });

  it('falls back to the supplied default when absent', async () => {
    expect(await getSettingWithDefault(db, 'auto_add_shortfalls', '1')).toBe('1');
  });

  it('getCurrencySymbol defaults to EUR euro sign per §5.10', async () => {
    expect(await getCurrencySymbol(db)).toBe('€');
  });

  it('getCurrencySymbol reflects a changed setting', async () => {
    await db.runAsync('INSERT INTO setting (key, value) VALUES (?, ?)', ['currency_symbol', '£']);
    expect(await getCurrencySymbol(db)).toBe('£');
  });
});
