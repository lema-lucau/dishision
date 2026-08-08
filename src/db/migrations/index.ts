import { migration001 } from './001_initial';
import { migration002 } from './002_capitalize_names';
import { migration003 } from './003_shopping_sections_and_unit_prefs';
import { migration004 } from './004_ingredient_category_and_par_level';
import { migration005 } from './005_ingredient_prices';
import { migration006 } from './006_shared_cooks';
import { migration007 } from './007_dishision_bot';
import { migration008 } from './008_prune_empty_bot_chats';
import { migration009 } from './009_sync_log_items';
import { migration010 } from './010_bot_usage_surface';
import { migration011 } from './011_bot_chat_cook_log';

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
  { version: 8, sql: migration008 },
  { version: 9, sql: migration009 },
  { version: 10, sql: migration010 },
  { version: 11, sql: migration011 },
];
