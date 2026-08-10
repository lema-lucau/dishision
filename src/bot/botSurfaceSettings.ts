// §A3.2 per-surface enable/disable. Each Dishision Bot surface can be turned
// off independently — some are speculative, and killing exactly one (say the
// mid-cook quick-ask) shouldn't be an all-or-nothing decision. All default ON.
// When a surface is off its entry point is hidden entirely (not greyed).
// Turning off recipe creation & refinement hides its entry points but never
// deletes existing chat history.
import type { DbClient } from '../db/DbClient';
import { getSettingWithDefault } from '../settings/getSetting';
import { setSetting } from '../settings/setSetting';
import type { BotSurface } from './botSession';

export const BOT_SURFACES: BotSurface[] = [
  'recipe_chat',
  'cook_log_refine',
  'cooking_quick_ask',
  'weekly_planning',
  'feeling_fallback',
  'theme_creator',
];

export const SURFACE_TOGGLE_LABELS: Record<BotSurface, string> = {
  recipe_chat: 'Recipe creation & refinement',
  cook_log_refine: 'Cook log refine',
  cooking_quick_ask: 'Cooking mode quick-ask',
  weekly_planning: 'Weekly planning',
  feeling_fallback: "'I'm feeling' fallback",
  theme_creator: 'Theme creator palette',
};

export const SURFACE_TOGGLE_HINTS: Record<BotSurface, string> = {
  recipe_chat: 'The "Create with Dishision Bot" and "Refine with Dishision Bot" entry points.',
  cook_log_refine: 'A "Refine with Dishision Bot" action on a cook log entry, acting on that cook\'s feedback.',
  cooking_quick_ask: 'A quick question sheet while you\'re cooking — substitutions, doneness, terms.',
  weekly_planning: 'A conversational "help me plan this week".',
  feeling_fallback: 'A "Create this with Dishision Bot" option when nothing matches on the "I\'m feeling" screen.',
  theme_creator: 'A "Generate a palette" helper in the theme creator that fills the colours from a description.',
};

const TOGGLE_KEYS: Record<BotSurface, string> = {
  recipe_chat: 'bot_surface_recipe_chat',
  cook_log_refine: 'bot_surface_cook_log_refine',
  cooking_quick_ask: 'bot_surface_cooking_quick_ask',
  weekly_planning: 'bot_surface_weekly_planning',
  feeling_fallback: 'bot_surface_feeling_fallback',
  theme_creator: 'bot_surface_theme_creator',
};

export async function getSurfaceEnabled(db: DbClient, surface: BotSurface): Promise<boolean> {
  return (await getSettingWithDefault(db, TOGGLE_KEYS[surface], '1')) !== '0';
}

export async function getAllSurfaceToggles(db: DbClient): Promise<Record<BotSurface, boolean>> {
  const out = {} as Record<BotSurface, boolean>;
  for (const s of BOT_SURFACES) out[s] = await getSurfaceEnabled(db, s);
  return out;
}

export async function setSurfaceEnabled(db: DbClient, surface: BotSurface, on: boolean): Promise<void> {
  await setSetting(db, TOGGLE_KEYS[surface], on ? '1' : '0');
}
