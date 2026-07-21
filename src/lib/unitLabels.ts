// Single source of truth for how units are labelled and pluralised in the
// UI (§3.1). 'unit' is the internal/storage name inherited from the schema
// — it always displays as "item"/"items", never "unit(s)".
import type { RecipeUnit } from '../seed/types';
import type { DisplayUnit } from './displayUnit';

export const UNIT_OPTIONS: RecipeUnit[] = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'unit'];

export const UNIT_LABELS: Record<RecipeUnit, string> = {
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'l',
  tsp: 'tsp',
  tbsp: 'tbsp',
  cup: 'cup',
  unit: 'item',
};

export const DISPLAY_UNIT_LABELS: Record<DisplayUnit, string> = {
  ...UNIT_LABELS,
  pack: 'pack',
};

// g/kg/ml/l don't pluralise ("500g", not "500gs") — everything else does.
const PLURALIZABLE: Partial<Record<DisplayUnit, true>> = {
  unit: true,
  tsp: true,
  tbsp: true,
  cup: true,
  pack: true,
};

export function pluralizeUnit(quantity: number, unit: DisplayUnit): string {
  const label = DISPLAY_UNIT_LABELS[unit];
  if (quantity === 1 || !PLURALIZABLE[unit]) return label;
  return `${label}s`;
}
