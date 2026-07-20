import { migration001 } from './001_initial';
import { migration002 } from './002_capitalize_names';

export interface Migration {
  version: number;
  sql: string;
}

// Applied in order inside migrate() (§2.6). Add new migrations by appending
// here — never edit a migration that has already shipped.
export const migrations: Migration[] = [
  { version: 1, sql: migration001 },
  { version: 2, sql: migration002 },
];
