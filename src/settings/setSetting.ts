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
