import { migration001 } from './001_initial';
import { migration002 } from './002_capitalize_names';
import { migration003 } from './003_shopping_sections_and_unit_prefs';
import { migration004 } from './004_ingredient_category_and_par_level';
import { migration005 } from './005_ingredient_prices';
import { migration006 } from './006_shared_cooks';
import { migration007 } from './007_dishision_bot';

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
  { version: 5, sql: migration005 },
  { version: 6, sql: migration006 },
  { version: 7, sql: migration007 },
];
