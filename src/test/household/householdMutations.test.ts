import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import {
  countRecipeVisibility,
  getHouseholdMember,
  listHouseholdMembers,
  removeHouseholdMember,
  setRecipeVisibility,
  updateLastKnownAddress,
  updateMemberProfile,
  upsertHouseholdMember,
} from '../../household/householdMutations';
import { createManualRecipe, type RecipeDraft } from '../../recipes/recipeSave';
import { createTestDb } from '../support/testDb';

function baseDraft(overrides: Partial<RecipeDraft> = {}): RecipeDraft {
  return {
    name: 'Thai Green Curry',
    description: '',
    photoEmoji: '🍛',
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

describe('household member repo (§5.11, §7.5)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('upserts on pairing and excludes removed members from the default list', async () => {
    await upsertHouseholdMember(db, { personId: 'tara-1', displayName: 'Tara', avatarEmoji: '🥑', syncSecret: 'abc123' });
    const members = await listHouseholdMembers(db);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ personId: 'tara-1', displayName: 'Tara', syncSecret: 'abc123', removedAt: null });
  });

  it('re-pairing (upsert again) overwrites the secret and clears any prior removal', async () => {
    await upsertHouseholdMember(db, { personId: 'tara-1', displayName: 'Tara', avatarEmoji: '🥑', syncSecret: 'old-secret' });
    await removeHouseholdMember(db, 'tara-1');
    expect(await listHouseholdMembers(db)).toHaveLength(0);

    await upsertHouseholdMember(db, { personId: 'tara-1', displayName: 'Tara', avatarEmoji: '🥑', syncSecret: 'new-secret' });
    const member = await getHouseholdMember(db, 'tara-1');
    expect(member?.syncSecret).toBe('new-secret');
    expect(member?.removedAt).toBeNull();
  });

  it('removal is a tombstone, not a delete, and cascades cache + ratings away', async () => {
    await upsertHouseholdMember(db, { personId: 'tara-1', displayName: 'Tara', avatarEmoji: '🥑', syncSecret: 'abc123' });
    await db.runAsync(
      `INSERT INTO household_recipe_cache (person_id, share_id, payload, name) VALUES ('tara-1', 'share-1', '{}', 'Carbonara')`,
    );
    await db.runAsync(`INSERT INTO household_rating (person_id, share_id, stars) VALUES ('tara-1', 'share-1', 4.5)`);

    await removeHouseholdMember(db, 'tara-1');

    const member = await getHouseholdMember(db, 'tara-1');
    expect(member).not.toBeNull(); // tombstone survives
    expect(member?.removedAt).not.toBeNull();

    const cache = await db.getAllAsync('SELECT * FROM household_recipe_cache WHERE person_id = ?', ['tara-1']);
    expect(cache).toHaveLength(0);
    const ratings = await db.getAllAsync('SELECT * FROM household_rating WHERE person_id = ?', ['tara-1']);
    expect(ratings).toHaveLength(0);

    // Excluded from the active list, present with includeRemoved.
    expect(await listHouseholdMembers(db)).toHaveLength(0);
    expect(await listHouseholdMembers(db, { includeRemoved: true })).toHaveLength(1);
  });

  it('updateLastKnownAddress and updateMemberProfile write through', async () => {
    await upsertHouseholdMember(db, { personId: 'tara-1', displayName: 'Tara', avatarEmoji: '🥑', syncSecret: 'abc123' });
    await updateLastKnownAddress(db, 'tara-1', '192.168.1.24:5883');
    await updateMemberProfile(db, 'tara-1', 'Tara Renamed', '🍅');

    const member = await getHouseholdMember(db, 'tara-1');
    expect(member?.lastKnownAddress).toBe('192.168.1.24:5883');
    expect(member?.displayName).toBe('Tara Renamed');
    expect(member?.avatarEmoji).toBe('🍅');
  });

  it('visibility is private by default and setRecipeVisibility flips it per-recipe', async () => {
    const id1 = await createManualRecipe(db, baseDraft({ name: 'Recipe A' }));
    const id2 = await createManualRecipe(db, baseDraft({ name: 'Recipe B' }));

    let counts = await countRecipeVisibility(db);
    expect(counts).toEqual({ total: 2, public: 0 });

    await setRecipeVisibility(db, id1, 'public');
    counts = await countRecipeVisibility(db);
    expect(counts).toEqual({ total: 2, public: 1 });

    const row = await db.getFirstAsync<{ visibility: string }>('SELECT visibility FROM recipe WHERE id = ?', [id2]);
    expect(row?.visibility).toBe('private');
  });
});
