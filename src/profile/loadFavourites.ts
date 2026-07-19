// Top-5 favourites for the profile page (§5.10, §2.5 "top 5 by date added").
// Ordered by when the recipe was favourited, newest first.
import type { DbClient } from '../db/DbClient';

export interface FavouriteSummary {
  recipeId: number;
  name: string;
  photoEmoji: string;
  photoUri: string | null;
}

export async function loadTopFavourites(db: DbClient, limit = 5): Promise<FavouriteSummary[]> {
  const rows = await db.getAllAsync<{
    recipe_id: number;
    name: string;
    photo_emoji: string;
    photo_uri: string | null;
  }>(
    `SELECT f.recipe_id, r.name, r.photo_emoji, r.photo_uri
     FROM favourite f
     JOIN recipe r ON r.id = f.recipe_id
     ORDER BY f.created_at DESC, f.recipe_id DESC
     LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({
    recipeId: r.recipe_id,
    name: r.name,
    photoEmoji: r.photo_emoji,
    photoUri: r.photo_uri,
  }));
}
