// The shape both expo-sqlite's SQLiteDatabase and the better-sqlite3 test
// adapter satisfy. migrate() and every query module in the app are written
// against this interface, never against expo-sqlite directly — that's what
// makes the §11.1 parity rule (tests run the exact same migration chain and
// pragmas as the app) mechanically true rather than merely intended.
export type SQLiteBindParams = unknown[] | Record<string, unknown>;

export interface DbRunResult {
  lastInsertRowId: number;
  changes: number;
}

export interface DbClient {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: SQLiteBindParams): Promise<DbRunResult>;
  getFirstAsync<T = unknown>(sql: string, params?: SQLiteBindParams): Promise<T | null>;
  getAllAsync<T = unknown>(sql: string, params?: SQLiteBindParams): Promise<T[]>;
}
