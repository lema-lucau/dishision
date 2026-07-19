// Read access to the `setting` table (§2.3). A missing key is normal — most
// settings are only ever written when a user actually changes them, so every
// read degrades honestly to a caller-supplied default rather than throwing.
import type { DbClient } from '../db/DbClient';

export async function getSetting(db: DbClient, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM setting WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function getSettingWithDefault(db: DbClient, key: string, fallback: string): Promise<string> {
  return (await getSetting(db, key)) ?? fallback;
}

// §5.10 default display currency is EUR / '€'.
export async function getCurrencySymbol(db: DbClient): Promise<string> {
  return getSettingWithDefault(db, 'currency_symbol', '€');
}

// §5.7: auto-add is a preference, on by default. The real-shortfall rule
// itself always applies — this toggle only gates the automatic insertion.
export async function getAutoAddShortfalls(db: DbClient): Promise<boolean> {
  return (await getSettingWithDefault(db, 'auto_add_shortfalls', '1')) === '1';
}
