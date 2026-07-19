// Write access to the `setting` table (§2.3). The counterpart to getSetting.ts.
// Upserts by key so a setting is only ever stored once — the row is created the
// first time a user changes a value and overwritten thereafter.
import type { DbClient } from '../db/DbClient';

export async function setSetting(db: DbClient, key: string, value: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}
