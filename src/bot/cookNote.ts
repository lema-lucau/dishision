// §A2.4: a note the user leaves mid-cook ("refine this recipe after cooking")
// so they can act on it once they're done, rather than starting a refinement
// while they're still at the stove. Stored per recipe in the shared `setting`
// table; the Cook Complete screen reads it to prefill the log's Notes field
// (§I), then clears it.
import type { DbClient } from '../db/DbClient';
import { getSetting } from '../settings/getSetting';
import { setSetting } from '../settings/setSetting';

function key(recipeId: number): string {
  return `bot_cook_note_${recipeId}`;
}

export async function setPendingCookNote(db: DbClient, recipeId: number, note: string): Promise<void> {
  await setSetting(db, key(recipeId), note.trim());
}

export async function getPendingCookNote(db: DbClient, recipeId: number): Promise<string | null> {
  const v = await getSetting(db, key(recipeId));
  return v && v.trim() ? v : null;
}

export async function clearPendingCookNote(db: DbClient, recipeId: number): Promise<void> {
  await setSetting(db, key(recipeId), '');
}
