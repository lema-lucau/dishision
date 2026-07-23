// Favourites for the profile page. By default the top 5 by when they were
// favourited (newest first); if the user has hand-picked which favourites to
// show (profile_favourite_ids setting), those are shown in the chosen order.
import type { DbClient } from '../db/DbClient';
import { getSetting } from '../settings/getSetting';
import { setSetting } from '../settings/setSetting';

export const PROFILE_FAVOURITE_IDS_KEY = 'profile_favourite_ids';
export const MAX_PROFILE_FAVOURITES = 5;

export interface FavouriteSummary {
  recipeId: number;
  name: string;
  photoEmoji: string;
  photoUri: string | null;
}

interface FavRow {
  recipe_id: number;
  name: string;
  photo_emoji: string;
  photo_uri: string | null;
}

function toSummary(r: FavRow): FavouriteSummary {
  return { recipeId: r.recipe_id, name: r.name, photoEmoji: r.photo_emoji, photoUri: r.photo_uri };
}

export async function getProfileFavouriteIds(db: DbClient): Promise<number[]> {
  const raw = await getSetting(db, PROFILE_FAVOURITE_IDS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is number => typeof x === 'number') : [];
  } catch {
    return [];
  }
}

export async function setProfileFavouriteIds(db: DbClient, ids: number[]): Promise<void> {
  await setSetting(db, PROFILE_FAVOURITE_IDS_KEY, JSON.stringify(ids.slice(0, MAX_PROFILE_FAVOURITES)));
}

export async function loadTopFavourites(db: DbClient, limit = MAX_PROFILE_FAVOURITES): Promise<FavouriteSummary[]> {
  const chosenIds = await getProfileFavouriteIds(db);
  if (chosenIds.length > 0) {
    const placeholders = chosenIds.map(() => '?').join(',');
    const rows = await db.getAllAsync<FavRow>(
      `SELECT f.recipe_id, r.name, r.photo_emoji, r.photo_uri
       FROM favourite f JOIN recipe r ON r.id = f.recipe_id
       WHERE f.recipe_id IN (${placeholders})`,
      chosenIds,
    );
    // Preserve the user's chosen order, and silently drop any that are no
    // longer favourited/exist.
    const byId = new Map(rows.map((r) => [r.recipe_id, r]));
    return chosenIds.map((id) => byId.get(id)).filter((r): r is FavRow => r != null).map(toSummary);
  }

  const rows = await db.getAllAsync<FavRow>(
    `SELECT f.recipe_id, r.name, r.photo_emoji, r.photo_uri
     FROM favourite f
     JOIN recipe r ON r.id = f.recipe_id
     ORDER BY f.created_at DESC, f.recipe_id DESC
     LIMIT ?`,
    [limit],
  );
  return rows.map(toSummary);
}

// Every favourited recipe — the pool the "choose which to show" modal picks from.
export async function loadAllFavourites(db: DbClient): Promise<FavouriteSummary[]> {
  const rows = await db.getAllAsync<FavRow>(
    `SELECT f.recipe_id, r.name, r.photo_emoji, r.photo_uri
     FROM favourite f
     JOIN recipe r ON r.id = f.recipe_id
     ORDER BY f.created_at DESC, f.recipe_id DESC`,
  );
  return rows.map(toSummary);
}
