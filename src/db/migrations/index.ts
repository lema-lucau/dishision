import { migration001 } from './001_initial';
import { migration002 } from './002_capitalize_names';
import { migration003 } from './003_shopping_sections_and_unit_prefs';
import { migration004 } from './004_ingredient_category_and_par_level';

export interface Migration {
  version: number;
  sql: string;
}

// Applied in order inside migrate() (§2.6). Add new migrations by appending
// here — never edit a migration that has already shipped.
export const migrations: Migration[] = [
  { version: 1, sql: migration001 },
  { version: 2, sql: migration002 },
  { version: 3, sql: migration003 },
  { version: 4, sql: migration004 },
];
