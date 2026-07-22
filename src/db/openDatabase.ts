import * as SQLite from 'expo-sqlite';
import { logger } from '../debug/logStore';
import { migrate } from './migrate';
import { migrations } from './migrations';

const DATABASE_NAME = 'dishision.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// The single place a connection to the app database is opened (§2.6, §15).
// Nothing else may call expo-sqlite's openDatabaseAsync. Sets the two
// pragmas the whole schema depends on — foreign_keys, without which every
// ON DELETE CASCADE in the migration is decorative, and WAL, for crash
// resilience mid-cook — then runs the migration chain.
export function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openDatabaseInternal();
  }
  return dbPromise;
}

async function openDatabaseInternal(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await migrate(db, migrations);
  logger.info('db', 'Database ready', { name: DATABASE_NAME });
  return db;
}
