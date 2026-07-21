// §7.1: "Ingredients travel with canonical_name as a string, not an ID —
// the recipient resolves it against their own table or creates it."
// Resolution is exact-match only (name or alias, case-insensitive) — the
// same "degrade honestly" call the rest of the app makes elsewhere: guessing
// a base_unit for an auto-created canonical row would silently corrupt
// macro/cost maths, so an unmatched ingredient is left canonical_id=NULL
// (still displays, excluded from macros/cost/pantry — §3.2) rather than
// invented. The import preview surfaces the unmatched count so it's never
// a silent gap.
import type { DbClient } from '../db/DbClient';

export async function resolveCanonicalIngredientId(db: DbClient, name: string): Promise<number | null> {
  const needle = name.trim();
  if (!needle) return null;
  const byName = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM canonical_ingredient WHERE name = ? COLLATE NOCASE',
    [needle],
  );
  if (byName) return byName.id;
  const byAlias = await db.getFirstAsync<{ canonical_id: number }>(
    'SELECT canonical_id FROM canonical_ingredient_alias WHERE alias = ? COLLATE NOCASE',
    [needle],
  );
  return byAlias?.canonical_id ?? null;
}
