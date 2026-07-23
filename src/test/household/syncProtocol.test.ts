import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { getHouseholdMember, upsertHouseholdMember } from '../../household/householdMutations';
import { runInitiatorSync, runResponderSync, type LocalIdentity } from '../../household/syncProtocol';
import { queueSharedCook, listPendingSharedCooks } from '../../household/sharedCooks';
import { setRecipeVisibility } from '../../household/householdMutations';
import { toggleFavourite } from '../../recipes/recipeMutations';
import { createManualRecipe, type RecipeDraft } from '../../recipes/recipeSave';
import { createChannelPair } from '../support/fakeSyncChannel';
import { createTestDb } from '../support/testDb';

function baseDraft(overrides: Partial<RecipeDraft> = {}): RecipeDraft {
  return {
    name: 'Carbonara',
    description: 'Classic.',
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

const ME: LocalIdentity = { personId: 'me-1', displayName: 'Lema', avatarEmoji: '🍜' };
const TARA: LocalIdentity = { personId: 'tara-1', displayName: 'Tara', avatarEmoji: '🥑' };
const SECRET = 'shared-secret-abc';

async function pairBothSides(meDb: DbClient, taraDb: DbClient) {
  await upsertHouseholdMember(meDb, { personId: TARA.personId, displayName: TARA.displayName, avatarEmoji: TARA.avatarEmoji, syncSecret: SECRET });
  await upsertHouseholdMember(taraDb, { personId: ME.personId, displayName: ME.displayName, avatarEmoji: ME.avatarEmoji, syncSecret: SECRET });
}

describe('household sync protocol (§7.5)', () => {
  let meDb: DbClient;
  let taraDb: DbClient;

  beforeEach(async () => {
    meDb = await createTestDb();
    taraDb = await createTestDb();
  });

  it('pulls only public recipes into the cache, with the responder\'s favourite flag attached', async () => {
    await pairBothSides(meDb, taraDb);
    const publicId = await createManualRecipe(taraDb, baseDraft({ name: 'Carbonara' }));
    await setRecipeVisibility(taraDb, publicId, 'public');
    await toggleFavourite(taraDb, publicId, false);
    const privateId = await createManualRecipe(taraDb, baseDraft({ name: 'Family secret' }));
    void privateId; // stays private, must not appear in the cache

    const [initiatorChannel, responderChannel] = createChannelPair();
    const [result] = await Promise.all([
      runInitiatorSync(meDb, initiatorChannel, ME, TARA.personId, SECRET),
      runResponderSync(taraDb, responderChannel, TARA),
    ]);

    expect(result).toMatchObject({ droppedByPeer: false, recipesReceived: 1, recipesRemoved: 0 });

    const cached = await meDb.getAllAsync<{ name: string; is_favourite: number }>('SELECT name, is_favourite FROM household_recipe_cache WHERE person_id = ?', [TARA.personId]);
    expect(cached).toHaveLength(1);
    expect(cached[0]).toMatchObject({ name: 'Carbonara', is_favourite: 1 });

    const member = await getHouseholdMember(meDb, TARA.personId);
    expect(member?.lastSyncedAt).not.toBeNull();
  });

  it('pushes queued shared cooks to the peer, who logs them against their matching recipe', async () => {
    await pairBothSides(meDb, taraDb);
    // Tara has a recipe I also cooked; the cook I logged "with" her attaches to
    // her copy on her device, matched by share_id.
    const taraRecipeId = await createManualRecipe(taraDb, baseDraft({ name: 'Carbonara' }));
    const shareId = (await taraDb.getFirstAsync<{ share_id: string }>('SELECT share_id FROM recipe WHERE id = ?', [taraRecipeId]))!.share_id;

    await queueSharedCook(meDb, TARA.personId, {
      recipeShareId: shareId,
      recipeName: 'Carbonara',
      cookedAt: '2026-07-01T18:00:00.000Z',
      servingsMade: 2,
      servingsEaten: 2,
      stars: 5,
      notes: 'shared',
    });

    const [initiatorChannel, responderChannel] = createChannelPair();
    const [result] = await Promise.all([
      runInitiatorSync(meDb, initiatorChannel, ME, TARA.personId, SECRET),
      runResponderSync(taraDb, responderChannel, TARA),
    ]);

    expect(result.sharedCooksPushed).toBe(1);
    // Tara now has a cook_log for the shared recipe.
    const taraCooks = await taraDb.getAllAsync<{ recipe_id: number; stars: number }>('SELECT recipe_id, stars FROM cook_log');
    expect(taraCooks).toHaveLength(1);
    expect(taraCooks[0]).toMatchObject({ recipe_id: taraRecipeId, stars: 5 });
    // My outbox entry is cleared so it won't be re-sent.
    expect(await listPendingSharedCooks(meDb, TARA.personId)).toHaveLength(0);
  });

  it('a wrong secret is rejected, closes the connection, and writes nothing', async () => {
    await pairBothSides(meDb, taraDb);
    await createManualRecipe(taraDb, baseDraft());
    await setRecipeVisibility(taraDb, (await taraDb.getFirstAsync<{ id: number }>('SELECT id FROM recipe'))!.id, 'public');

    const [initiatorChannel, responderChannel] = createChannelPair();
    const [result] = await Promise.allSettled([
      runInitiatorSync(meDb, initiatorChannel, ME, TARA.personId, 'totally-wrong-secret'),
      runResponderSync(taraDb, responderChannel, TARA),
    ]);

    expect(result.status).toBe('rejected');

    const cached = await meDb.getAllAsync('SELECT * FROM household_recipe_cache');
    expect(cached).toHaveLength(0);

    const events = await taraDb.getAllAsync<{ kind: string }>('SELECT kind FROM sync_event');
    expect(events.map((e) => e.kind)).toContain('auth_rejected');
  });

  it('a peer who removed us reports a tombstone, and we drop them locally too', async () => {
    await pairBothSides(meDb, taraDb);
    // Tara removed me on her side.
    await taraDb.runAsync("UPDATE household_member SET removed_at = datetime('now') WHERE person_id = ?", [ME.personId]);

    const [initiatorChannel, responderChannel] = createChannelPair();
    const [result] = await Promise.all([
      runInitiatorSync(meDb, initiatorChannel, ME, TARA.personId, SECRET),
      runResponderSync(taraDb, responderChannel, TARA),
    ]);

    expect(result.droppedByPeer).toBe(true);
    const member = await getHouseholdMember(meDb, TARA.personId);
    expect(member?.removedAt).not.toBeNull();
  });

  it('a recipe made private since the last sync disappears from the cache on re-sync', async () => {
    await pairBothSides(meDb, taraDb);
    const recipeId = await createManualRecipe(taraDb, baseDraft());
    await setRecipeVisibility(taraDb, recipeId, 'public');

    async function sync() {
      const [initiatorChannel, responderChannel] = createChannelPair();
      await Promise.all([
        runInitiatorSync(meDb, initiatorChannel, ME, TARA.personId, SECRET),
        runResponderSync(taraDb, responderChannel, TARA),
      ]);
    }

    await sync();
    expect(await meDb.getAllAsync('SELECT * FROM household_recipe_cache')).toHaveLength(1);

    await setRecipeVisibility(taraDb, recipeId, 'private');
    await sync();
    expect(await meDb.getAllAsync('SELECT * FROM household_recipe_cache')).toHaveLength(0);
  });

  it('never serves a payload for a recipe that is not (or no longer) public, even if requested', async () => {
    await pairBothSides(meDb, taraDb);
    const recipeId = await createManualRecipe(taraDb, baseDraft());
    const shareId = (await taraDb.getFirstAsync<{ share_id: string }>('SELECT share_id FROM recipe WHERE id = ?', [recipeId]))!.share_id;
    // Never made public at all.

    // Drive the responder directly with a forged request for the private share_id.
    const [a, b] = createChannelPair();
    const responderPromise = runResponderSync(taraDb, b, TARA);
    await a.send({ type: 'hello', personId: ME.personId, secret: SECRET });
    await a.receive(); // hello_ack
    await a.send({ type: 'profile', displayName: ME.displayName, avatarEmoji: ME.avatarEmoji });
    await a.receive(); // profile
    await a.send({ type: 'tombstone_check' });
    await a.receive(); // tombstone
    await a.send({ type: 'manifest_request' });
    await a.receive(); // manifest (empty, since nothing is public)
    await a.send({ type: 'payload_request', shareIds: [shareId] });
    const payloadMsg = await a.receive();
    await a.send({ type: 'shared_cooks', entries: [] });
    await a.receive(); // shared_cooks_ack
    await a.send({ type: 'done' });
    await responderPromise;

    expect(payloadMsg).toMatchObject({ type: 'payload', entries: [] });
  });

  it('a failure mid-commit leaves the previous cache untouched (atomicity)', async () => {
    await pairBothSides(meDb, taraDb);
    // Seed an existing cache row for Tara so we can prove it survives.
    await meDb.runAsync(
      `INSERT INTO household_recipe_cache (person_id, share_id, payload, name) VALUES (?, 'existing-share', '{}', 'Untouched')`,
      [TARA.personId],
    );

    const [initiatorChannel, driverChannel] = createChannelPair();
    const initiatorPromise = runInitiatorSync(meDb, initiatorChannel, ME, TARA.personId, SECRET);

    await driverChannel.receive(); // hello
    await driverChannel.send({ type: 'hello_ack', personId: TARA.personId });
    await driverChannel.receive(); // profile
    await driverChannel.send({ type: 'profile', displayName: 'Tara', avatarEmoji: '🥑' });
    await driverChannel.receive(); // tombstone_check
    await driverChannel.send({ type: 'tombstone', removed: false });
    await driverChannel.receive(); // manifest_request
    await driverChannel.send({ type: 'manifest', items: [{ shareId: 'bad-share', updatedAt: new Date().toISOString() }] });
    await driverChannel.receive(); // payload_request

    // A malformed entry — payload.recipe.name is NOT NULL in the cache
    // table, so the INSERT for this row must fail mid-transaction.
    await driverChannel.send({
      type: 'payload',
      entries: [
        {
          shareId: 'bad-share',
          isFavourite: false,
          favouritedAt: null,
          payload: {
            v: 1,
            share_id: 'bad-share',
            recipe: {
              name: null as any,
              description: null,
              base_servings: 2,
              timeline_mode: 'sequential',
              origin_label: null,
              origin_url: null,
              photo: null,
              photo_emoji: '🍽️',
            },
            ingredients: [],
            lanes: [],
            steps: [],
            tags: [],
          },
        },
      ],
    });
    await driverChannel.receive(); // shared_cooks
    await driverChannel.send({ type: 'shared_cooks_ack', applied: 0, skipped: 0 });
    await driverChannel.receive(); // done

    await expect(initiatorPromise).rejects.toThrow();

    const cached = await meDb.getAllAsync<{ name: string }>('SELECT name FROM household_recipe_cache WHERE person_id = ?', [TARA.personId]);
    expect(cached).toHaveLength(1);
    expect(cached[0].name).toBe('Untouched');
  });
});
