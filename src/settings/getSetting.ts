// Read access to the `setting` table (§2.3). A missing key is normal — most
// settings are only ever written when a user actually changes them, so every
// read degrades honestly to a caller-supplied default rather than throwing.
import type { DbClient } from '../db/DbClient';
import { parseMealCategories, type MealCategory } from '../recommend/mealCategories';
import { activeSymbol, clampActiveIndex, parseShortlist, type Currency } from '../lib/currency';

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

// §E (batch-2) household size — how many people a batch is divided across. Drives
// the deterministic leftover planner's coverage math and the planning prompt so
// the two agree. Default 2; at least 1.
export async function getHouseholdSize(db: DbClient): Promise<number> {
  const n = Number(await getSettingWithDefault(db, 'household_size', '2'));
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 2;
}

// §5.6 Cooking Mode alert toggles — vibrate is read directly by
// CookingModeScreen via getSettingWithDefault; these wrappers exist for the
// Settings screen and keep the default values in one place. (The full-screen
// "takeover" alert was retired in batch-2 C1 in favour of a non-blocking flash.)
export async function getAlertVibrate(db: DbClient): Promise<boolean> {
  return (await getSettingWithDefault(db, 'alert_vibrate', '1')) === '1';
}
export async function getAlertSound(db: DbClient): Promise<boolean> {
  return (await getSettingWithDefault(db, 'alert_sound', '1')) === '1';
}

// §D1: auto-advance cooking steps by default. When off, a step that becomes due
// waits for the cook to confirm before advancing.
export async function getCookAutoAdvance(db: DbClient): Promise<boolean> {
  return (await getSettingWithDefault(db, 'cook_auto_advance', '1')) === '1';
}

// §E: automatic household sync (foreground + change triggers). On by default;
// manual "Sync now" always remains available regardless.
export async function getAutoSyncEnabled(db: DbClient): Promise<boolean> {
  return (await getSettingWithDefault(db, 'auto_sync_enabled', '1')) === '1';
}

// §5.10 currency: code + symbol, display-only (no conversion, no rescale).
export async function getCurrencyCode(db: DbClient): Promise<string> {
  return getSettingWithDefault(db, 'currency_code', 'EUR');
}

// §G currency shortlist: up to 5 currencies with one active. currency_symbol is
// kept in sync with the active symbol so every existing reader keeps working.
export interface CurrencyState {
  shortlist: Currency[];
  activeIndex: number;
}

export async function getCurrencyState(db: DbClient): Promise<CurrencyState> {
  const shortlist = parseShortlist(await getSetting(db, 'currency_shortlist'));
  const rawIndex = Number(await getSetting(db, 'currency_active'));
  return { shortlist, activeIndex: clampActiveIndex(rawIndex, shortlist.length) };
}

export async function getActiveCurrencySymbol(db: DbClient): Promise<string> {
  const { shortlist, activeIndex } = await getCurrencyState(db);
  return activeSymbol(shortlist, activeIndex);
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

// §12 dev tooling: the Debug entry's visibility is remembered across launches.
// Off by default; hydrated into the in-memory settings store at app start.
export async function getDebugMode(db: DbClient): Promise<boolean> {
  return (await getSettingWithDefault(db, 'debug_mode', '0')) === '1';
}

// Meal-category recommender filter: which of breakfast/lunch/dinner/dessert the
// engine is allowed to suggest. Stored as a CSV; absent = all four (no
// restriction). See recommend/mealCategories.ts for the set semantics.
export async function getRecommendCategories(db: DbClient): Promise<MealCategory[]> {
  return parseMealCategories(await getSetting(db, 'recommend_categories'));
}
