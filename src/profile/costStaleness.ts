// §6.9 cost staleness: a dismissible, monthly-at-most nudge on the Me tab,
// plus the refresh screen it opens into. Never blocks anything — stale
// costs still compute, they're just flagged (§6.9, §11.2).
import type { DbClient } from '../db/DbClient';
import { invalidateMedianCostCache } from '../recommend/medianCostCache';
import { getCostPromptDismissedAt, getCostStalenessDays } from '../settings/getSetting';
import { setCostPromptDismissedAt } from '../settings/setSetting';

const REARM_DAYS = 30;

export interface StaleIngredient {
  id: number;
  name: string;
  costPer100: number | null;
  costUpdatedAt: string | null;
}

export async function loadStaleIngredients(db: DbClient, thresholdDays?: number): Promise<StaleIngredient[]> {
  const days = thresholdDays ?? (await getCostStalenessDays(db));
  if (days === 0) return []; // "never" — staleness checking is off
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = await db.getAllAsync<{ id: number; name: string; cost_per_100: number | null; cost_updated_at: string | null }>(
    `SELECT id, name, cost_per_100, cost_updated_at FROM canonical_ingredient
     WHERE cost_per_100 IS NOT NULL AND cost_updated_at IS NOT NULL AND cost_updated_at < ?
     ORDER BY cost_updated_at ASC`,
    [cutoff],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, costPer100: r.cost_per_100, costUpdatedAt: r.cost_updated_at }));
}

// Whether the Me-tab prompt should show right now: there's at least one
// stale ingredient, and either it's never been dismissed or the dismissal
// is more than 30 days old (§6.9 — "re-arms after 30 days, not on next open").
export async function shouldShowCostPrompt(db: DbClient, now: Date = new Date()): Promise<boolean> {
  const stale = await loadStaleIngredients(db);
  if (stale.length === 0) return false;
  const dismissedAt = await getCostPromptDismissedAt(db);
  if (!dismissedAt) return true;
  const rearmAt = new Date(dismissedAt).getTime() + REARM_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() >= rearmAt;
}

export async function dismissCostPrompt(db: DbClient): Promise<void> {
  await setCostPromptDismissedAt(db, new Date().toISOString());
}

export async function updateIngredientCost(db: DbClient, canonicalId: number, costPer100: number): Promise<void> {
  await db.runAsync(`UPDATE canonical_ingredient SET cost_per_100 = ?, cost_updated_at = datetime('now') WHERE id = ?`, [
    costPer100,
    canonicalId,
  ]);
  await invalidateMedianCostCache(db);
}
