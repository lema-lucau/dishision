// better-sqlite3 ships without its own type declarations and @types/better-sqlite3
// isn't on the §15.1 allowlist. This covers only the surface testDb.ts uses.
declare module 'better-sqlite3' {
  interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  interface Statement {
    run(...params: unknown[]): RunResult;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  class Database {
    constructor(filename: string);
    exec(sql: string): this;
    prepare(sql: string): Statement;
    close(): void;
  }

  export = Database;
}
