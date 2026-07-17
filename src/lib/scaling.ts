// Serving scaling (§3.4). Two independent concerns: computing the scaled
// raw quantity (used for macro/cost/pantry maths, never rounded) and
// formatting it for display (rounded per the branches below).

import type { RecipeUnit } from '../seed/types';

// scalable=1 → quantity × (target ÷ base). scalable=0 → unchanged (bay leaf,
// "a pinch of salt", oil for frying) regardless of serving count.
export function scaleQuantity(
  quantity: number,
  scalable: boolean,
  baseServings: number,
  targetServings: number,
): number {
  if (!scalable) return quantity;
  return quantity * (targetServings / baseServings);
}

// Display rounding only — never applied to values feeding macro/cost maths.
export function roundQuantity(value: number): number {
  if (value < 10) return Math.round(value * 10) / 10;
  if (value <= 100) return Math.round(value);
  return Math.round(value / 5) * 5;
}

// "1–2 eggs" for a fractional countable result. Whole numbers pass through.
export function formatCountableRange(value: number): string {
  if (Number.isInteger(value)) return `${value}`;
  const low = Math.floor(value);
  const high = Math.ceil(value);
  return `${low}–${high}`;
}

// The single display-formatting entry point: countable 'unit' quantities
// get the range treatment when fractional; everything else gets the
// threshold-based rounding.
export function formatScaledQuantity(value: number, unit: RecipeUnit): string {
  if (unit === 'unit' && !Number.isInteger(value)) {
    return formatCountableRange(value);
  }
  return `${roundQuantity(value)}`;
}
