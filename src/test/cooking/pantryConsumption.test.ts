import { describe, expect, it } from 'vitest';
import { computeConsumption, type ConsumptionIngredientInput } from '../../cooking/pantryConsumption';

function ing(overrides: Partial<ConsumptionIngredientInput> = {}): ConsumptionIngredientInput {
  return {
    canonicalId: 1,
    quantity: 400,
    unit: 'g',
    scalable: true,
    baseUnit: 'g',
    packSize: null,
    density: null,
    pantryQuantity: 1000,
    ...overrides,
  };
}

describe('computeConsumption (§5.7)', () => {
  it('deducts the servings_made-scaled quantity from an existing pantry row', () => {
    // base servings 2, made 4 -> double the recipe quantity
    const [line] = computeConsumption([ing({ quantity: 200, pantryQuantity: 1000 })], 2, 4);
    expect(line.neededBaseUnits).toBe(400);
    expect(line.deductedBaseUnits).toBe(400);
    expect(line.remainingPantryQuantity).toBe(600);
    expect(line.realShortfall).toBe(false);
  });

  it('flags a real shortfall only when a pantry row existed and was insufficient', () => {
    const [line] = computeConsumption([ing({ quantity: 400, pantryQuantity: 300 })], 2, 2);
    expect(line.realShortfall).toBe(true);
    expect(line.shortfallBaseUnits).toBe(100);
    expect(line.deductedBaseUnits).toBe(300);
    expect(line.remainingPantryQuantity).toBe(0);
  });

  it('an ingredient the pantry never knew about produces no line at all (not a shortfall)', () => {
    const lines = computeConsumption([ing({ pantryQuantity: null })], 2, 2);
    expect(lines).toHaveLength(0);
  });

  it('skips unmeasured ingredients (no canonical match)', () => {
    const lines = computeConsumption([ing({ canonicalId: null })], 2, 2);
    expect(lines).toHaveLength(0);
  });

  it('non-scalable ingredients (bay leaf, a pinch of salt) consume the unscaled quantity regardless of servings_made', () => {
    const [line] = computeConsumption([ing({ quantity: 1, scalable: false, pantryQuantity: 100 })], 2, 8);
    expect(line.neededBaseUnits).toBe(1);
  });
});
