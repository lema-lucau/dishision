import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { upsertHouseholdMember } from '../../household/householdMutations';
import { loadHouseholdCacheRecipes, topFiveFavourites } from '../../household/loadHouseholdCacheRecipes';
import { upsertHouseholdCacheEntry } from '../../household/syncCache';
import type { PayloadEntry } from '../../household/syncTypes';
import type { SharePayload } from '../../sharing/payload';
import { createTestDb } from '../support/testDb';

function makePayload(name: string, shareId: string): SharePayload {
  return {
    v: 1,
    share_id: shareId,
    recipe: {
      name,
      description: 'Tasty.',
      base_servings: 2,
      timeline_mode: 'sequential',
      origin_label: null,
      origin_url: null,
      photo: null,
      photo_emoji: '🍝',
    },
    ingredients: [{ display_name: 'Pasta', canonical_name: 'Pasta', quantity: 200, unit: 'g', scalable: true, optional: false }],
    lanes: [],
    steps: [{ lane: null, phase: 'cook', instruction: 'Boil', duration_seconds: 600, start_offset_seconds: 0, effort: 'passive', important: false }],
    tags: ['italian'],
  };
}

describe('loadHouseholdCacheRecipes (§5.12)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
    await upsertHouseholdMember(db, { personId: 'tara-1', displayName: 'Tara', avatarEmoji: '🥑', syncSecret: 'secret' });
  });

  it('reshapes cache rows into EnrichedRecipe-compatible objects the shared list component can render', async () => {
    const entry: PayloadEntry = { shareId: 'share-1', payload: makePayload('Carbonara', 'share-1'), isFavourite: true, favouritedAt: '2026-07-01T00:00:00Z' };
    await upsertHouseholdCacheEntry(db, 'tara-1', entry);

    const recipes = await loadHouseholdCacheRecipes(db, 'tara-1');
    expect(recipes).toHaveLength(1);
    expect(recipes[0]).toMatchObject({
      name: 'Carbonara',
      shareId: 'share-1',
      isFavourite: true,
      visibility: 'public',
      tags: ['italian'],
    });
    expect(recipes[0].ingredients).toHaveLength(1);
    expect(recipes[0].steps).toHaveLength(1);
    expect(recipes[0].totalSeconds).toBe(600);
  });

  it('topFiveFavourites orders by favourited_at DESC and caps at 5', async () => {
    for (let i = 0; i < 7; i++) {
      await upsertHouseholdCacheEntry(db, 'tara-1', {
        shareId: `share-${i}`,
        payload: makePayload(`Recipe ${i}`, `share-${i}`),
        isFavourite: i < 6, // 6 favourites, 1 not
        favouritedAt: i < 6 ? `2026-07-0${i + 1}T00:00:00Z` : null,
      });
    }
    const recipes = await loadHouseholdCacheRecipes(db, 'tara-1');
    const top5 = topFiveFavourites(recipes);
    expect(top5).toHaveLength(5);
    expect(top5.map((r) => r.name)).toEqual(['Recipe 5', 'Recipe 4', 'Recipe 3', 'Recipe 2', 'Recipe 1']);
  });

  it('returns an empty top-5 when there are no favourites, not an error', async () => {
    await upsertHouseholdCacheEntry(db, 'tara-1', { shareId: 's', payload: makePayload('Solo', 's'), isFavourite: false, favouritedAt: null });
    const recipes = await loadHouseholdCacheRecipes(db, 'tara-1');
    expect(topFiveFavourites(recipes)).toEqual([]);
  });
});
