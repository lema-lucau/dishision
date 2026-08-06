// Write access to the `setting` table (§2.3). The counterpart to getSetting.ts.
// Upserts by key so a setting is only ever stored once — the row is created the
// first time a user changes a value and overwritten thereafter.
import type { DbClient } from '../db/DbClient';
import type { RecommendationWeights } from './getSetting';

export async function setSetting(db: DbClient, key: string, value: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

export async function setRecencyWindowDays(db: DbClient, days: number): Promise<void> {
  await setSetting(db, 'recency_window_days', String(days));
}

export async function setRecommendationWeights(db: DbClient, weights: RecommendationWeights): Promise<void> {
  await setSetting(db, 'recommendation_weights', JSON.stringify(weights));
}

export async function setDefaultServingSize(db: DbClient, servings: number): Promise<void> {
  await setSetting(db, 'default_serving_size', String(servings));
}

export async function setAlertVibrate(db: DbClient, on: boolean): Promise<void> {
  await setSetting(db, 'alert_vibrate', on ? '1' : '0');
}
export async function setAlertSound(db: DbClient, on: boolean): Promise<void> {
  await setSetting(db, 'alert_sound', on ? '1' : '0');
}
export async function setAlertTakeover(db: DbClient, on: boolean): Promise<void> {
  await setSetting(db, 'alert_takeover', on ? '1' : '0');
}

export async function setAutoAddShortfalls(db: DbClient, on: boolean): Promise<void> {
  await setSetting(db, 'auto_add_shortfalls', on ? '1' : '0');
}

export async function setCurrency(db: DbClient, code: string, symbol: string): Promise<void> {
  await setSetting(db, 'currency_code', code);
  await setSetting(db, 'currency_symbol', symbol);
}

export async function setCostStalenessDays(db: DbClient, days: number): Promise<void> {
  await setSetting(db, 'cost_staleness_days', String(days));
}

export async function setCostPromptDismissedAt(db: DbClient, iso: string): Promise<void> {
  await setSetting(db, 'cost_prompt_dismissed_at', iso);
}

export async function setOnboardingComplete(db: DbClient): Promise<void> {
  await setSetting(db, 'onboarding_complete', '1');
}
