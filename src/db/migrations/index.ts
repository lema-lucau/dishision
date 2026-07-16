import { migration001 } from './001_initial';

export interface Migration {
  version: number;
  sql: string;
}

// Applied in order inside migrate() (§2.6). Add new migrations by appending
// here — never edit a migration that has already shipped.
export const migrations: Migration[] = [{ version: 1, sql: migration001 }];
