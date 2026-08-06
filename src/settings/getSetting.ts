// Read access to the `setting` table (§2.3). A missing key is normal — most
// settings are only ever written when a user actually changes them, so every
// read degrades honestly to a caller-supplied default rather than throwing.
import type { DbClient } from '../db/DbClient';

export async function getSetting(db: DbClient, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM setting WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function getSettingWithDefault(db: DbClient, key: string, fallback: string): Promise<string> {
  return (await getSetting(db, key)) ?? fallback;
}

// §5.10 default display currency is EUR / '€'.
export async function getCurrencySymbol(db: DbClient): Promise<string> {
  return getSettingWithDefault(db, 'currency_symbol', '€');
}

// §5.7: auto-add is a preference, on by default. The real-shortfall rule
// itself always applies — this toggle only gates the automatic insertion.
export async function getAutoAddShortfalls(db: DbClient): Promise<boolean> {
  return (await getSettingWithDefault(db, 'auto_add_shortfalls', '1')) === '1';
}

// §6.2: days to exclude recently cooked recipes from recommendations.
// 0-30, default 5; 0 disables the filter entirely.
export async function getRecencyWindowDays(db: DbClient): Promise<number> {
  return Number(await getSettingWithDefault(db, 'recency_window_days', '5'));
}

export interface RecommendationWeights {
  wRecency: number;
  wRating: number;
  wFrequency: number;
  wJitter: number;
}

// §6.1 default weights, tunable in settings (§5.10).
export const DEFAULT_RECOMMENDATION_WEIGHTS: RecommendationWeights = {
  wRecency: 0.35,
  wRating: 0.3,
  wFrequency: 0.2,
  wJitter: 0.15,
};

export async function getRecommendationWeights(db: DbClient): Promise<RecommendationWeights> {
  const raw = await getSetting(db, 'recommendation_weights');
  if (raw == null) return DEFAULT_RECOMMENDATION_WEIGHTS;
  try {
    return { ...DEFAULT_RECOMMENDATION_WEIGHTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_RECOMMENDATION_WEIGHTS;
  }
}

// §5.10 default serving size, used to pre-fill new recipes and the "how
// many servings" prompts.
export async function getDefaultServingSize(db: DbClient): Promise<number> {
  return Number(await getSettingWithDefault(db, 'default_serving_size', '2'));
}

// §5.6 Cooking Mode alert toggles — vibrate/takeover are already read
// directly by CookingModeScreen via getSettingWithDefault; these wrappers
// exist for the Settings screen and keep the default values in one place.
export async function getAlertVibrate(db: DbClient): Promise<boolean> {
  return (await getSettingWithDefault(db, 'alert_vibrate', '1')) === '1';
}
export async function getAlertSound(db: DbClient): Promise<boolean> {
  return (await getSettingWithDefault(db, 'alert_sound', '1')) === '1';
}
export async function getAlertTakeover(db: DbClient): Promise<boolean> {
  return (await getSettingWithDefault(db, 'alert_takeover', '1')) === '1';
}

// §5.10 currency: code + symbol, display-only (no conversion, no rescale).
export async function getCurrencyCode(db: DbClient): Promise<string> {
  return getSettingWithDefault(db, 'currency_code', 'EUR');
}

export type CostStalenessDays = 60 | 90 | 180 | 0; // 0 = never
export async function getCostStalenessDays(db: DbClient): Promise<CostStalenessDays> {
  return Number(await getSettingWithDefault(db, 'cost_staleness_days', '90')) as CostStalenessDays;
}

// §6.9: the stale-cost prompt re-arms 30 days after being dismissed, not on
// every app open. Stores the ISO instant it was last dismissed.
export async function getCostPromptDismissedAt(db: DbClient): Promise<string | null> {
  return getSetting(db, 'cost_prompt_dismissed_at');
}

// First-run onboarding (product review §2): shown once, on the very first
// launch, then never again — the flag survives even if it was skipped.
export async function getOnboardingComplete(db: DbClient): Promise<boolean> {
  return (await getSettingWithDefault(db, 'onboarding_complete', '0')) === '1';
}
