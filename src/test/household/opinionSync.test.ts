import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { setRecipeVisibility, upsertHouseholdMember } from '../../household/householdMutations';
import {
  applyReceivedRatings,
  computeHouseholdAverage,
  isRatingStale,
  listMyPublicRatings,
  loadRatingBreakdown,
} from '../../household/opinionSync';
import { runRatingsInitiator, runRatingsResponder, type LocalIdentity } from '../../household/syncProtocol';
import { createManualRecipe, type RecipeDraft } from '../../recipes/recipeSave';
import { createChannelPair } from '../support/fakeSyncChannel';
import { createTestDb } from '../support/testDb';

function baseDraft(overrides: Partial<RecipeDraft> = {}): RecipeDraft {
  return {
    name: 'Carbonara',
    description: '',
    photoEmoji: '🍝',
    baseServings: 2,
    timelineMode: 'sequential',
    originLabel: '',
    lanes: [],
    ingredients: [],
    steps: [],
    tags: [],
    ...overrides,
  };
}

async function logCook(db: DbClient, recipeId: number, stars: number | null): Promise<void> {
  await db.runAsync(
    `INSERT INTO cook_log (recipe_id, cooked_at, servings_made, servings_eaten, stars, completed)
     VALUES (?, datetime('now'), 2, 2, ?, 1)`,
    [recipeId, stars],
  );
}

async function shareIdOf(db: DbClient, recipeId: number): Promise<string> {
  return (await db.getFirstAsync<{ share_id: string }>('SELECT share_id FROM recipe WHERE id = ?', [recipeId]))!.share_id;
}

const ME: LocalIdentity = { personId: 'me-1', displayName: 'Lema', avatarEmoji: '🍜' };
const TARA: LocalIdentity = { personId: 'tara-1', displayName: 'Tara', avatarEmoji: '🥑' };
const SECRET = 'shared-secret-abc';

async function pairBothSides(meDb: DbClient, taraDb: DbClient) {
  await upsertHouseholdMember(meDb, { personId: TARA.personId, displayName: TARA.displayName, avatarEmoji: TARA.avatarEmoji, syncSecret: SECRET });
  await upsertHouseholdMember(taraDb, { personId: ME.personId, displayName: ME.displayName, avatarEmoji: ME.avatarEmoji, syncSecret: SECRET });
}

describe('opinion sync — derivation (§7.6, §2.5)', () => {
  let db: DbClient;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it('listMyPublicRatings returns only public, rated recipes as derived averages', async () => {
    const publicRated = await createManualRecipe(db, baseDraft({ name: 'Public Rated' }));
    await setRecipeVisibility(db, publicRated, 'public');
    await logCook(db, publicRated, 4);
    await logCook(db, publicRated, 5); // avg 4.5

    const publicUnrated = await createManualRecipe(db, baseDraft({ name: 'Public Unrated' }));
    await setRecipeVisibility(db, publicUnrated, 'public');
    await logCook(db, publicUnrated, null); // cooked but never rated → excluded

    const privateRated = await createManualRecipe(db, baseDraft({ name: 'Private Rated' }));
    await logCook(db, privateRated, 5); // private → never crosses

    const ratings = await listMyPublicRatings(db);
    expect(ratings).toHaveLength(1);
    expect(ratings[0]).toMatchObject({ shareId: await shareIdOf(db, publicRated), stars: 4.5 });
  });

  it('applyReceivedRatings upserts, overwriting a prior snapshot rather than duplicating', async () => {
    await upsertHouseholdMember(db, { personId: TARA.personId, displayName: 'Tara', avatarEmoji: '🥑', syncSecret: SECRET });
    await applyReceivedRatings(db, TARA.personId, [{ shareId: 'share-x', stars: 4 }]);
    await applyReceivedRatings(db, TARA.personId, [{ shareId: 'share-x', stars: 5 }]);

    const rows = await db.getAllAsync<{ stars: number }>('SELECT stars FROM household_rating WHERE person_id = ? AND share_id = ?', [TARA.personId, 'share-x']);
    expect(rows).toHaveLength(1);
    expect(rows[0].stars).toBe(5);
  });

  it('computeHouseholdAverage blends mine, or averages theirs alone with no self-rating', () => {
    // (4.5 + 5) / 2 = 4.75
    expect(computeHouseholdAverage(4.5, [5])).toBeCloseTo(4.75);
    // no rating of my own → average of theirs, never divide by a phantom
    expect(computeHouseholdAverage(null, [4, 5])).toBeCloseTo(4.5);
    // no household ratings → hidden
    expect(computeHouseholdAverage(4, [])).toBeNull();
  });

  it('loadRatingBreakdown joins active members and derives the average', async () => {
    await upsertHouseholdMember(db, { personId: TARA.personId, displayName: 'Tara', avatarEmoji: '🥑', syncSecret: SECRET });
    await applyReceivedRatings(db, TARA.personId, [{ shareId: 'share-x', stars: 5 }]);

    const breakdown = await loadRatingBreakdown(db, 'share-x', 4.5);
    expect(breakdown.myRating).toBe(4.5);
    expect(breakdown.household).toHaveLength(1);
    expect(breakdown.household[0]).toMatchObject({ displayName: 'Tara', avatarEmoji: '🥑', stars: 5 });
    expect(breakdown.householdAverage).toBeCloseTo(4.75);
  });

  it('isRatingStale flips past the 60-day window', () => {
    const now = Date.parse('2026-07-23T00:00:00Z');
    expect(isRatingStale('2026-07-01T00:00:00Z', now)).toBe(false);
    expect(isRatingStale('2026-04-01T00:00:00Z', now)).toBe(true);
  });
});

describe('opinion sync — protocol (§7.6)', () => {
  let meDb: DbClient;
  let taraDb: DbClient;
  beforeEach(async () => {
    meDb = await createTestDb();
    taraDb = await createTestDb();
  });

  it('sends my public ratings; the peer stores them keyed on my person_id', async () => {
    await pairBothSides(meDb, taraDb);
    const recipeId = await createManualRecipe(meDb, baseDraft({ name: 'Carbonara' }));
    await setRecipeVisibility(meDb, recipeId, 'public');
    await logCook(meDb, recipeId, 4);
    await logCook(meDb, recipeId, 5); // avg 4.5
    const shareId = await shareIdOf(meDb, recipeId);

    const [initiatorChannel, responderChannel] = createChannelPair();
    const [result] = await Promise.all([
      runRatingsInitiator(meDb, initiatorChannel, ME, TARA.personId, SECRET),
      runRatingsResponder(taraDb, responderChannel),
    ]);

    expect(result.ratingsSent).toBe(1);
    const stored = await taraDb.getAllAsync<{ person_id: string; share_id: string; stars: number }>('SELECT * FROM household_rating');
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ person_id: ME.personId, share_id: shareId, stars: 4.5 });

    const events = await taraDb.getAllAsync<{ kind: string; direction: string }>('SELECT kind, direction FROM sync_event');
    expect(events).toContainEqual({ kind: 'ratings', direction: 'received' });

    // §B6: per-item detail is captured on both sides. Tara receives a rating for
    // a recipe she doesn't have (name falls back, no local recipe to link to).
    const taraItems = await taraDb.getAllAsync<{ item_type: string; action: string; name_snapshot: string; detail: string; recipe_id: number | null }>(
      'SELECT item_type, action, name_snapshot, detail, recipe_id FROM sync_log_item',
    );
    expect(taraItems).toHaveLength(1);
    expect(taraItems[0]).toMatchObject({ item_type: 'rating', action: 'added', detail: '★4.5', recipe_id: null });
    // I sent one rating, linked to my local Carbonara.
    const myItems = await meDb.getAllAsync<{ item_type: string; action: string; name_snapshot: string; recipe_id: number | null }>(
      'SELECT item_type, action, name_snapshot, recipe_id FROM sync_log_item',
    );
    expect(myItems).toHaveLength(1);
    expect(myItems[0]).toMatchObject({ item_type: 'rating', action: 'sent', name_snapshot: 'Carbonara', recipe_id: recipeId });
  });

  it('orphan rule: a rating for a recipe the peer lacks persists and attaches on later import', async () => {
    await pairBothSides(meDb, taraDb);
    const recipeId = await createManualRecipe(meDb, baseDraft({ name: 'Secret Family Dish' }));
    await setRecipeVisibility(meDb, recipeId, 'public');
    await logCook(meDb, recipeId, 5);
    const shareId = await shareIdOf(meDb, recipeId);

    // Send while Tara does NOT have this recipe.
    const [initiatorChannel, responderChannel] = createChannelPair();
    await Promise.all([
      runRatingsInitiator(meDb, initiatorChannel, ME, TARA.personId, SECRET),
      runRatingsResponder(taraDb, responderChannel),
    ]);

    // The rating sits dormant — no local recipe matches yet.
    const dormant = await taraDb.getAllAsync<{ share_id: string; stars: number }>('SELECT share_id, stars FROM household_rating');
    expect(dormant).toEqual([{ share_id: shareId, stars: 5 }]);
    let breakdown = await loadRatingBreakdown(taraDb, shareId, null);
    expect(breakdown.household).toHaveLength(1);

    // Tara later imports the recipe (same share_id lineage) — no re-sync.
    const importedId = await createManualRecipe(taraDb, baseDraft({ name: 'Secret Family Dish' }));
    await taraDb.runAsync('UPDATE recipe SET share_id = ? WHERE id = ?', [shareId, importedId]);

    // The dormant rating now attaches to Tara's own recipe, unchanged.
    breakdown = await loadRatingBreakdown(taraDb, await shareIdOf(taraDb, importedId), null);
    expect(breakdown.household).toHaveLength(1);
    expect(breakdown.household[0].stars).toBe(5);
    expect(breakdown.householdAverage).toBe(5);
  });

  it('a wrong secret is rejected, closes the connection, and stores nothing', async () => {
    await pairBothSides(meDb, taraDb);
    const recipeId = await createManualRecipe(meDb, baseDraft());
    await setRecipeVisibility(meDb, recipeId, 'public');
    await logCook(meDb, recipeId, 5);

    const [initiatorChannel, responderChannel] = createChannelPair();
    const [result] = await Promise.allSettled([
      runRatingsInitiator(meDb, initiatorChannel, ME, TARA.personId, 'wrong-secret'),
      runRatingsResponder(taraDb, responderChannel),
    ]);

    expect(result.status).toBe('rejected');
    expect(await taraDb.getAllAsync('SELECT * FROM household_rating')).toHaveLength(0);
    const events = await taraDb.getAllAsync<{ kind: string }>('SELECT kind FROM sync_event');
    expect(events.map((e) => e.kind)).toContain('auth_rejected');
  });
});
