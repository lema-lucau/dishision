// Per-ingredient price points (see migration 005). Each price point is a real
// "this much for this price" observation; the *effective* cost the recipe
// cost pipeline uses is the best value (cheapest per base unit) across them.
//
// Deliberately never written back into canonical_ingredient.cost_per_100:
// that column is the fallback (seed data, or a flat manual figure from the
// older Cost Refresh screen) and must survive price points being added and
// later removed. Overwriting it destructively would mean deleting your last
// manual price silently erased the seed cost forever instead of reverting to
// it. Every reader (loadRecipes.ts, ingredientAdmin.ts) computes the
// effective cost live: manual price points win when at least one converts,
// otherwise the stored cost_per_100 fallback is used.
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { canonicalIngredientName } from '../debug/logNames';
import { invalidateMedianCostCache } from '../recommend/medianCostCache';
import { convertToBaseUnit } from '../lib/units';
import type { BaseUnit, RecipeUnit } from '../seed/types';

export interface IngredientPrice {
  id: number;
  canonicalId: number;
  quantity: number;
  unit: RecipeUnit;
  price: number;
  createdAt: string;
}

export interface PriceableIngredient {
  baseUnit: BaseUnit;
  packSize?: number | null;
  density?: number | null;
}

// Normalise one price point to cost per 100 base units, or null when the
// quantity can't be converted to the ingredient's base unit (§3.2 — never
// guess). e.g. "1 kg for €5" on a gram-based ingredient → 5 / 1000 * 100 = 0.50.
export function pricePointCostPer100(
  ingredient: PriceableIngredient,
  point: { quantity: number; unit: RecipeUnit; price: number },
): number | null {
  if (point.quantity <= 0 || point.price < 0) return null;
  const { value, measured } = convertToBaseUnit(ingredient, point.quantity, point.unit);
  if (!measured || value == null || value <= 0) return null;
  return (point.price / value) * 100;
}

// The best (cheapest per base unit) manual price across an ingredient's price
// points. Returns null when there are none, or none are convertible — the
// caller falls back to the ingredient's stored cost_per_100 in that case,
// never fabricating a number.
export function deriveCostPer100(
  ingredient: PriceableIngredient,
  points: { quantity: number; unit: RecipeUnit; price: number }[],
): number | null {
  const per100 = points.map((p) => pricePointCostPer100(ingredient, p)).filter((v): v is number => v != null);
  if (per100.length === 0) return null;
  return Math.min(...per100);
}

// manual wins whenever at least one price point converts; otherwise the
// ingredient's stored (seed, or old flat Cost-Refresh) cost_per_100 is used.
export function effectiveCostPer100(manualCostPer100: number | null, fallbackCostPer100: number | null): number | null {
  return manualCostPer100 ?? fallbackCostPer100;
}

export async function loadIngredientPrices(db: DbClient, canonicalId: number): Promise<IngredientPrice[]> {
  const rows = await db.getAllAsync<{ id: number; canonical_id: number; quantity: number; unit: RecipeUnit; price: number; created_at: string }>(
    'SELECT id, canonical_id, quantity, unit, price, created_at FROM ingredient_price WHERE canonical_id = ? ORDER BY created_at DESC, id DESC',
    [canonicalId],
  );
  return rows.map((r) => ({ id: r.id, canonicalId: r.canonical_id, quantity: r.quantity, unit: r.unit, price: r.price, createdAt: r.created_at }));
}

// Batch loader for readers that need every priced ingredient's points at
// once (loadRecipes.ts, ingredientAdmin.ts) — one query instead of N.
export async function loadPricesForCanonicalIds(
  db: DbClient,
  canonicalIds: number[],
): Promise<Map<number, { quantity: number; unit: RecipeUnit; price: number; createdAt: string }[]>> {
  const map = new Map<number, { quantity: number; unit: RecipeUnit; price: number; createdAt: string }[]>();
  if (canonicalIds.length === 0) return map;
  const placeholders = canonicalIds.map(() => '?').join(',');
  const rows = await db.getAllAsync<{ canonical_id: number; quantity: number; unit: RecipeUnit; price: number; created_at: string }>(
    `SELECT canonical_id, quantity, unit, price, created_at FROM ingredient_price WHERE canonical_id IN (${placeholders})`,
    canonicalIds,
  );
  for (const r of rows) {
    const list = map.get(r.canonical_id) ?? [];
    list.push({ quantity: r.quantity, unit: r.unit, price: r.price, createdAt: r.created_at });
    map.set(r.canonical_id, list);
  }
  return map;
}

export async function addIngredientPrice(
  db: DbClient,
  canonicalId: number,
  quantity: number,
  unit: RecipeUnit,
  price: number,
): Promise<void> {
  await db.runAsync('INSERT INTO ingredient_price (canonical_id, quantity, unit, price) VALUES (?, ?, ?, ?)', [
    canonicalId,
    quantity,
    unit,
    price,
  ]);
  // The effective cost is computed live by readers, not stored — but the
  // recommendation engine's median-cost cache is a stored snapshot and does
  // need explicit invalidation whenever a price that could shift it changes.
  await invalidateMedianCostCache(db);
  logger.info('db', 'Added ingredient price', { canonicalId, name: await canonicalIngredientName(db, canonicalId), quantity, unit, price });
}

export async function deleteIngredientPrice(db: DbClient, priceId: number, canonicalId: number): Promise<void> {
  await db.runAsync('DELETE FROM ingredient_price WHERE id = ?', [priceId]);
  await invalidateMedianCostCache(db);
  logger.info('db', 'Deleted ingredient price', { priceId, canonicalId, name: await canonicalIngredientName(db, canonicalId) });
}
