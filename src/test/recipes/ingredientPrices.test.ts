import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { loadIngredientsPage } from '../../recipes/ingredientAdmin';
import {
  addIngredientPrice,
  deleteIngredientPrice,
  deriveCostPer100,
  effectiveCostPer100,
  loadIngredientPrices,
  pricePointCostPer100,
} from '../../recipes/ingredientPrices';
import { createTestDb } from '../support/testDb';

async function insertIngredient(db: DbClient, name: string, baseUnit = 'g'): Promise<number> {
  const result = await db.runAsync('INSERT INTO canonical_ingredient (name, base_unit, source) VALUES (?, ?, ?)', [name, baseUnit, 'seed']);
  return result.lastInsertRowId;
}

describe('ingredient price derivation (pure)', () => {
  it('normalises a price point to cost per 100 base units', () => {
    // 500 g for €3 → €0.60 / 100 g
    expect(pricePointCostPer100({ baseUnit: 'g' }, { quantity: 500, unit: 'g', price: 3 })).toBeCloseTo(0.6);
    // 1 kg for €5 on a gram ingredient → €0.50 / 100 g
    expect(pricePointCostPer100({ baseUnit: 'g' }, { quantity: 1, unit: 'kg', price: 5 })).toBeCloseTo(0.5);
  });

  it('returns null when the quantity cannot be converted to the base unit', () => {
    // No pack size, so a "unit" quantity can't become grams.
    expect(pricePointCostPer100({ baseUnit: 'g' }, { quantity: 1, unit: 'unit', price: 2 })).toBeNull();
  });

  it('derives the cheapest per-base-unit option across price points', () => {
    const derived = deriveCostPer100({ baseUnit: 'g' }, [
      { quantity: 500, unit: 'g', price: 3 }, // 0.60/100g
      { quantity: 1, unit: 'kg', price: 5 }, // 0.50/100g (best value)
    ]);
    expect(derived).toBeCloseTo(0.5);
  });

  it('is null when no price point is convertible', () => {
    expect(deriveCostPer100({ baseUnit: 'g' }, [{ quantity: 1, unit: 'unit', price: 2 }])).toBeNull();
  });
});

describe('effectiveCostPer100', () => {
  it('prefers the manual price, falling back to the stored value only when there is no manual price', () => {
    expect(effectiveCostPer100(0.5, 2)).toBe(0.5);
    expect(effectiveCostPer100(null, 2)).toBe(2);
    expect(effectiveCostPer100(null, null)).toBeNull();
  });
});

describe('ingredient price mutations (DB)', () => {
  let db: DbClient;
  beforeEach(async () => {
    db = await createTestDb();
  });

  // Deliberately does NOT touch canonical_ingredient.cost_per_100 — that
  // column is the fallback (seed data / the old flat Cost Refresh figure)
  // and must survive price points being added and later removed. Every
  // reader computes the effective (manual-wins) cost live instead.
  it('adds price points without touching the stored cost_per_100 fallback', async () => {
    const id = await insertIngredient(db, 'Flour');
    await addIngredientPrice(db, id, 500, 'g', 3);
    await addIngredientPrice(db, id, 1, 'kg', 5);

    const prices = await loadIngredientPrices(db, id);
    expect(prices).toHaveLength(2);

    const row = await db.getFirstAsync<{ cost_per_100: number | null }>('SELECT cost_per_100 FROM canonical_ingredient WHERE id = ?', [id]);
    expect(row?.cost_per_100).toBeNull(); // untouched — this ingredient had no seeded fallback

    // The admin list surfaces the *effective* (manual, best-value) cost and
    // price count, without double-counting usage across the new join.
    const page = await loadIngredientsPage(db, { page: 1, pageSize: 20 });
    const flour = page.items.find((i) => i.name === 'Flour')!;
    expect(flour.priceCount).toBe(2);
    expect(flour.usageCount).toBe(0);
    expect(flour.costPer100).toBeCloseTo(0.5); // best value: 1kg/€5 beats 500g/€3
  });

  it('reverts to the seeded fallback cost once every manual price is removed', async () => {
    const result = await db.runAsync(
      'INSERT INTO canonical_ingredient (name, base_unit, cost_per_100, source) VALUES (?, ?, ?, ?)',
      ['Sugar', 'g', 0.3, 'seed'],
    );
    const id = result.lastInsertRowId;

    // Add a manual price that undercuts the seed figure...
    await addIngredientPrice(db, id, 1, 'kg', 1);
    let page = await loadIngredientsPage(db, { page: 1, pageSize: 20 });
    expect(page.items.find((i) => i.name === 'Sugar')!.costPer100).toBeCloseTo(0.1); // manual wins

    // ...then remove it: the seed fallback resurfaces, not null.
    const [only] = await loadIngredientPrices(db, id);
    await deleteIngredientPrice(db, only.id, id);
    page = await loadIngredientsPage(db, { page: 1, pageSize: 20 });
    expect(page.items.find((i) => i.name === 'Sugar')!.costPer100).toBeCloseTo(0.3); // back to seed

    // And the seed column itself was never overwritten in the first place.
    const row = await db.getFirstAsync<{ cost_per_100: number }>('SELECT cost_per_100 FROM canonical_ingredient WHERE id = ?', [id]);
    expect(row?.cost_per_100).toBeCloseTo(0.3);
  });

  it('cascade-deletes price points when the ingredient is deleted', async () => {
    const id = await insertIngredient(db, 'Salt');
    await addIngredientPrice(db, id, 500, 'g', 1);
    await db.runAsync('DELETE FROM canonical_ingredient WHERE id = ?', [id]);
    const prices = await loadIngredientPrices(db, id);
    expect(prices).toHaveLength(0);
  });
});
