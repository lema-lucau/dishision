// Canonical ingredient resolution for the recipe form (§5.5): search
// existing canonical_ingredient rows by name/alias, or create a minimal
// user-sourced one when nothing matches ("Add this ingredient").
import type { DbClient } from '../db/DbClient';
import type { BaseUnit } from '../seed/types';
import { capitalize } from '../lib/capitalize';

export interface CanonicalIngredientOption {
  id: number;
  name: string;
  baseUnit: BaseUnit;
}

export async function searchCanonicalIngredients(db: DbClient, query: string): Promise<CanonicalIngredientOption[]> {
  const needle = `%${query.trim()}%`;
  if (!query.trim()) {
    const rows = await db.getAllAsync<{ id: number; name: string; base_unit: BaseUnit }>(
      'SELECT id, name, base_unit FROM canonical_ingredient ORDER BY name LIMIT 20',
    );
    return rows.map((r) => ({ id: r.id, name: r.name, baseUnit: r.base_unit }));
  }
  const rows = await db.getAllAsync<{ id: number; name: string; base_unit: BaseUnit }>(
    `SELECT DISTINCT ci.id, ci.name, ci.base_unit
     FROM canonical_ingredient ci
     LEFT JOIN canonical_ingredient_alias a ON a.canonical_id = ci.id
     WHERE ci.name LIKE ? OR a.alias LIKE ?
     ORDER BY ci.name LIMIT 20`,
    [needle, needle],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, baseUnit: r.base_unit }));
}

// Minimal user-sourced ingredient (§5.5 "Add this ingredient" flow). Macros
// and cost are left null — the recipe still displays, but is excluded from
// macro/cost derivation and counts against the partial-data flag until
// someone fills them in (§3.2, §2.5).
export async function createUserIngredient(db: DbClient, name: string, baseUnit: BaseUnit): Promise<CanonicalIngredientOption> {
  const capitalized = capitalize(name.trim());
  const result = await db.runAsync(
    `INSERT INTO canonical_ingredient (name, base_unit, source) VALUES (?, ?, 'user')`,
    [capitalized, baseUnit],
  );
  return { id: result.lastInsertRowId, name: capitalized, baseUnit };
}
