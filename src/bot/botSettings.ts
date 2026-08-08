// §5 / §5.1: global Dishision Bot behaviour settings, stored in the shared
// `setting` table under bot_* keys (the API key is the sole exception — it
// lives in SecureStore, see apiKeyStore.ts). These are the global defaults;
// each chat snapshots them at creation time (§5.1, stored on bot_chat) so a
// later change here never retroactively alters an existing conversation.
import type { DbClient } from '../db/DbClient';
import { getSetting, getSettingWithDefault } from '../settings/getSetting';
import { setSetting } from '../settings/setSetting';
import {
  DEFAULT_BOT_SETTINGS,
  type BotBehaviourSettings,
  type BotModelKey,
  type LaneAggressiveness,
  type PreferredUnits,
  type StepDetailLevel,
} from './types';

const KEYS = {
  model: 'bot_model',
  lane: 'bot_lane_aggressiveness',
  stepDetail: 'bot_step_detail',
  units: 'bot_units',
  defaultServings: 'bot_default_servings',
  cookingPreferences: 'bot_cooking_preferences',
} as const;

function asOneOf<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export async function getBotSettings(db: DbClient): Promise<BotBehaviourSettings> {
  const model = asOneOf<BotModelKey>(
    await getSettingWithDefault(db, KEYS.model, DEFAULT_BOT_SETTINGS.model),
    ['haiku', 'sonnet'],
    DEFAULT_BOT_SETTINGS.model,
  );
  const laneAggressiveness = asOneOf<LaneAggressiveness>(
    await getSettingWithDefault(db, KEYS.lane, DEFAULT_BOT_SETTINGS.laneAggressiveness),
    ['never', 'balanced', 'aggressive'],
    DEFAULT_BOT_SETTINGS.laneAggressiveness,
  );
  const stepDetail = asOneOf<StepDetailLevel>(
    await getSettingWithDefault(db, KEYS.stepDetail, DEFAULT_BOT_SETTINGS.stepDetail),
    ['brief', 'detailed'],
    DEFAULT_BOT_SETTINGS.stepDetail,
  );
  const units = asOneOf<PreferredUnits>(
    await getSettingWithDefault(db, KEYS.units, DEFAULT_BOT_SETTINGS.units),
    ['metric', 'imperial'],
    DEFAULT_BOT_SETTINGS.units,
  );
  const servingsRaw = Number(await getSetting(db, KEYS.defaultServings));
  const defaultServings = Number.isFinite(servingsRaw) && servingsRaw >= 1 ? Math.round(servingsRaw) : DEFAULT_BOT_SETTINGS.defaultServings;
  const cookingPreferences = (await getSetting(db, KEYS.cookingPreferences)) ?? DEFAULT_BOT_SETTINGS.cookingPreferences;

  return { model, laneAggressiveness, stepDetail, units, defaultServings, cookingPreferences };
}

export async function setBotModel(db: DbClient, model: BotModelKey): Promise<void> {
  await setSetting(db, KEYS.model, model);
}
export async function setBotLaneAggressiveness(db: DbClient, value: LaneAggressiveness): Promise<void> {
  await setSetting(db, KEYS.lane, value);
}
export async function setBotStepDetail(db: DbClient, value: StepDetailLevel): Promise<void> {
  await setSetting(db, KEYS.stepDetail, value);
}
export async function setBotUnits(db: DbClient, value: PreferredUnits): Promise<void> {
  await setSetting(db, KEYS.units, value);
}
export async function setBotDefaultServings(db: DbClient, value: number): Promise<void> {
  await setSetting(db, KEYS.defaultServings, String(Math.max(1, Math.round(value))));
}
export async function setBotCookingPreferences(db: DbClient, value: string): Promise<void> {
  await setSetting(db, KEYS.cookingPreferences, value);
}
