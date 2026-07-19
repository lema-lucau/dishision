import { describe, expect, it } from 'vitest';
import { createTestDb } from '../support/testDb';
import { loadTopFavourites } from '../../profile/loadFavourites';
import type { DbClient } from '../../db/DbClient';

async function addRecipe(db: DbClient, name: string, emoji: string): Promise<number> {
  const res = await db.runAsync(
    "INSERT INTO recipe (share_id, name, photo_emoji) VALUES (?, ?, ?)",
    [`share-${name}`, name, emoji],
  );
  return res.lastInsertRowId;
}

describe('loadTopFavourites (§5.10, §2.5)', () => {
  it('returns favourites newest-first, capped at the limit', async () => {
    const db = await createTestDb();
    const a = await addRecipe(db, 'Carbonara', '🍝');
    const b = await addRecipe(db, 'Fish Pie', '🐟');
    const c = await addRecipe(db, 'Katsu', '🍛');

    // Explicit created_at so ordering is deterministic (b newest, a oldest).
    await db.runAsync('INSERT INTO favourite (recipe_id, created_at) VALUES (?, ?)', [a, '2026-01-01T00:00:00.000Z']);
    await db.runAsync('INSERT INTO favourite (recipe_id, created_at) VALUES (?, ?)', [c, '2026-02-01T00:00:00.000Z']);
    await db.runAsync('INSERT INTO favourite (recipe_id, created_at) VALUES (?, ?)', [b, '2026-03-01T00:00:00.000Z']);

    const favs = await loadTopFavourites(db, 5);
    expect(favs.map((f) => f.recipeId)).toEqual([b, c, a]);
    expect(favs[0]).toMatchObject({ name: 'Fish Pie', photoEmoji: '🐟' });
  });

  it('respects the limit', async () => {
    const db = await createTestDb();
    for (let i = 0; i < 8; i++) {
      const id = await addRecipe(db, `R${i}`, '🍽️');
      await db.runAsync('INSERT INTO favourite (recipe_id) VALUES (?)', [id]);
    }
    const favs = await loadTopFavourites(db, 5);
    expect(favs).toHaveLength(5);
  });

  it('returns an empty array when there are no favourites', async () => {
    const db = await createTestDb();
    expect(await loadTopFavourites(db)).toEqual([]);
  });
});
