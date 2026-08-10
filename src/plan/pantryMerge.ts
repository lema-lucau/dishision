// §C1: the pantry and staples are now one list. A staple can exist without any
// on-hand stock (no pantry_item row), so the unified list is the *union* of
// pantry items and staples, keyed by canonical ingredient id. Pantry rows carry
// the display/unit fields; staple rows contribute par-level / running-low state.
import type { DisplayUnit } from '../lib/displayUnit';
import type { BaseUnit } from '../seed/types';
import type { PantryItemRow } from './pantryMutations';
import type { StapleRow } from './staples';

export interface UnifiedPantryRow {
  canonicalId: number;
  name: string;
  category: string | null;
  baseUnit: BaseUnit;
  quantity: number;
  /** True when a pantry_item row backs this entry (i.e. there is on-hand stock
   * to edit). A staple with no stock is false — quantity is 0. */
  hasStock: boolean;
  packSize: number | null;
  packLabel: string | null;
  density: number | null;
  preferredUnit: DisplayUnit | null;
  isStaple: boolean;
  parLevel: number | null;
  runningLow: boolean;
}

export function mergePantryAndStaples(pantry: PantryItemRow[], staples: StapleRow[]): UnifiedPantryRow[] {
  const stapleById = new Map(staples.map((s) => [s.canonicalId, s]));
  const byId = new Map<number, UnifiedPantryRow>();

  for (const p of pantry) {
    const staple = stapleById.get(p.canonicalId);
    byId.set(p.canonicalId, {
      canonicalId: p.canonicalId,
      name: p.name,
      category: p.category,
      baseUnit: p.baseUnit,
      quantity: p.quantity,
      hasStock: true,
      packSize: p.packSize,
      packLabel: p.packLabel,
      density: p.density,
      preferredUnit: p.preferredUnit,
      isStaple: p.isStaple,
      parLevel: staple?.parLevel ?? null,
      runningLow: staple?.runningLow ?? false,
    });
  }

  // Staples with no pantry_item row: add a synthetic zero-stock entry so the
  // always-have list is fully visible and its par/running-low is editable.
  for (const s of staples) {
    if (byId.has(s.canonicalId)) continue;
    byId.set(s.canonicalId, {
      canonicalId: s.canonicalId,
      name: s.name,
      category: s.category,
      baseUnit: s.baseUnit,
      quantity: s.quantity,
      hasStock: false,
      packSize: null,
      packLabel: null,
      density: null,
      preferredUnit: null,
      isStaple: true,
      parLevel: s.parLevel,
      runningLow: s.runningLow,
    });
  }

  return Array.from(byId.values());
}
