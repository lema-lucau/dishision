import Database from 'better-sqlite3';
import type { DbClient, DbRunResult, SQLiteBindParams } from '../../db/DbClient';
import { migrate } from '../../db/migrate';
import { migrations } from '../../db/migrations';

function toParamArray(params?: SQLiteBindParams): unknown[] {
  if (params === undefined) return [];
  return Array.isArray(params) ? params : [params];
}

function wrapBetterSqlite3(raw: Database): DbClient {
  return {
    async execAsync(sql) {
      raw.exec(sql);
    },
    async runAsync(sql, params): Promise<DbRunResult> {
      const info = raw.prepare(sql).run(...toParamArray(params));
      return { lastInsertRowId: Number(info.lastInsertRowid), changes: info.changes };
    },
    async getFirstAsync<T>(sql: string, params?: SQLiteBindParams) {
      const row = raw.prepare(sql).get(...toParamArray(params));
      return (row ?? null) as T | null;
    },
    async getAllAsync<T>(sql: string, params?: SQLiteBindParams) {
      return raw.prepare(sql).all(...toParamArray(params)) as T[];
    },
  };
}

// Builds a fresh in-memory database by running the *real* migration chain
// (§2.6, §11.1) — never a copied/hand-rolled schema, so drift between the
// app and the tests is structurally impossible. Sets the one pragma the
// parity rule calls out: foreign_keys = ON. WAL is app-only (irrelevant to
// an in-memory connection) and is set outside migrate() in openDatabase.ts.
export async function createTestDb(): Promise<DbClient> {
  const raw = new Database(':memory:');
  const db = wrapBetterSqlite3(raw);
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await migrate(db, migrations);
  return db;
}
