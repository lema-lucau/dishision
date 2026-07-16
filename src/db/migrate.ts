import { logger } from '../debug/logStore';
import type { DbClient } from './DbClient';
import type { Migration } from './migrations';

interface UserVersionRow {
  user_version: number;
}

// Runs pending migrations in order, each in its own transaction, bumping
// PRAGMA user_version only after that migration's transaction commits
// (§2.6). Takes only a DbClient — this is what makes it identical whether
// it's called against expo-sqlite (app) or the better-sqlite3 adapter
// (tests, §11.1).
export async function migrate(db: DbClient, migrations: Migration[]): Promise<void> {
  const row = await db.getFirstAsync<UserVersionRow>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;

  const pending = migrations
    .filter((m) => m.version > currentVersion)
    .sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    await db.execAsync('BEGIN');
    try {
      await db.execAsync(migration.sql);
      await db.execAsync(`PRAGMA user_version = ${migration.version}`);
      await db.execAsync('COMMIT');
    } catch (error) {
      await db.execAsync('ROLLBACK');
      logger.error('db', `Migration ${migration.version} failed`, { error: String(error) });
      throw error;
    }
    logger.info('db', `Applied migration ${migration.version}`);
  }
}
