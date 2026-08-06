// Small name-resolvers for debug logging (§12). Log lines that previously
// carried only an id ("canonicalId: 1") were unreadable on their own — you
// couldn't tell 1 meant cheese. These fetch the human name so the log data can
// carry both. Best-effort: a lookup that fails (row gone mid-operation) returns
// null rather than throwing, because a log line must never break the operation
// it's describing.
import type { DbClient } from '../db/DbClient';

export async function canonicalIngredientName(db: DbClient, canonicalId: number | null | undefined): Promise<string | null> {
  if (canonicalId == null) return null;
  try {
    const row = await db.getFirstAsync<{ name: string }>('SELECT name FROM canonical_ingredient WHERE id = ?', [canonicalId]);
    return row?.name ?? null;
  } catch {
    return null;
  }
}

export async function recipeName(db: DbClient, recipeId: number | null | undefined): Promise<string | null> {
  if (recipeId == null) return null;
  try {
    const row = await db.getFirstAsync<{ name: string }>('SELECT name FROM recipe WHERE id = ?', [recipeId]);
    return row?.name ?? null;
  } catch {
    return null;
  }
}
