import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { createManualRecipe, type RecipeDraft } from '../../recipes/recipeSave';
import { buildSharePayload, parseSharePayload, serializeSharePayload } from '../../sharing/payload';
import {
  checkIngredientResolution,
  importAsNew,
  importKeepBoth,
  importMerge,
  matchImport,
  mergeRecipeLineage,
} from '../../sharing/importRecipe';
import { createTestDb } from '../support/testDb';

function baseDraft(overrides: Partial<RecipeDraft> = {}): RecipeDraft {
  return {
    name: 'Thai Green Curry',
    description: 'Weeknight staple.',
    photoEmoji: '🍛',
    baseServings: 2,
    timelineMode: 'sequential',
    originLabel: '',
    lanes: [],
    ingredients: [{ canonicalId: null, displayName: 'Coconut milk', quantity: 400, unit: 'ml', scalable: true, optional: false }],
    steps: [{ phase: 'cook', instruction: 'Simmer everything', durationSeconds: 900, effort: 'passive', important: false }],
    tags: ['chicken'],
    ...overrides,
  };
}

async function insertCookLog(db: DbClient, recipeId: number): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO cook_log (recipe_id, cooked_at, servings_made, servings_eaten, stars) VALUES (?, '2026-07-16T18:00:00.000Z', 2, 2, 4)`,
    [recipeId],
  );
  return result.lastInsertRowId;
}

describe('import matching and write paths (§7.3)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('no local match -> import as new, preserving the payload share_id', async () => {
    const sourceId = await createManualRecipe(db, baseDraft());
    const payload = await buildSharePayload(db, sourceId);

    // Fresh install: nothing local yet.
    const fresh = await createTestDb();
    const match = await matchImport(fresh, payload);
    expect(match.kind).toBe('no_match');

    const newId = await importAsNew(fresh, payload, 'Tara');
    const row = await fresh.getFirstAsync<{ share_id: string; source: string; imported_from: string }>(
      'SELECT share_id, source, imported_from FROM recipe WHERE id = ?',
      [newId],
    );
    expect(row?.share_id).toBe(payload.share_id);
    expect(row?.source).toBe('imported');
    expect(row?.imported_from).toBe('Tara');
  });

  it('share_id match with identical content -> no-op state, not a duplicate', async () => {
    const sourceId = await createManualRecipe(db, baseDraft());
    const payload = await buildSharePayload(db, sourceId);

    // Round-trip through the wire format exactly as a real transport would.
    const wireParsed = parseSharePayload(serializeSharePayload(payload));
    const match = await matchImport(db, wireParsed);
    expect(match).toMatchObject({ kind: 'identical', localRecipeId: sourceId });

    const count = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM recipe');
    expect(count?.c).toBe(1);
  });

  it('share -> tweak -> reshare -> import produces a diff, not a duplicate (S13 verify criterion)', async () => {
    const sourceId = await createManualRecipe(db, baseDraft());
    const payload = await buildSharePayload(db, sourceId);

    // Tweak the recipe after sharing it once.
    await db.runAsync('UPDATE recipe SET description = ? WHERE id = ?', ['Now with extra chilli.', sourceId]);
    const updatedPayload = await buildSharePayload(db, sourceId);

    // Simulate re-importing the updated payload onto a second device that
    // already has the original (same share_id, since it's the same lineage).
    const otherDevice = await createTestDb();
    await importAsNew(otherDevice, payload, null);

    const match = await matchImport(otherDevice, updatedPayload);
    expect(match.kind).toBe('differs');
    if (match.kind !== 'differs') throw new Error('expected differs');
    const descriptionDiff = match.diff.find((f) => f.field === 'description');
    expect(descriptionDiff?.changed).toBe(true);
    expect(descriptionDiff?.incoming).toBe('Now with extra chilli.');

    await importMerge(otherDevice, match.localRecipeId, updatedPayload, null);
    const count = await otherDevice.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM recipe');
    expect(count?.c).toBe(1);
    const merged = await otherDevice.getFirstAsync<{ description: string; share_id: string }>(
      'SELECT description, share_id FROM recipe WHERE id = ?',
      [match.localRecipeId],
    );
    expect(merged?.description).toBe('Now with extra chilli.');
    expect(merged?.share_id).toBe(payload.share_id);
  });

  it('"keep both" forks a new share_id rather than colliding on the UNIQUE column', async () => {
    const sourceId = await createManualRecipe(db, baseDraft());
    const payload = await buildSharePayload(db, sourceId);
    await db.runAsync('UPDATE recipe SET description = ? WHERE id = ?', ['A different take.', sourceId]);
    const updatedPayload = await buildSharePayload(db, sourceId);

    const otherDevice = await createTestDb();
    await importAsNew(otherDevice, payload, null);
    const match = await matchImport(otherDevice, updatedPayload);
    if (match.kind !== 'differs') throw new Error('expected differs');

    const keptBothId = await importKeepBoth(otherDevice, updatedPayload, null);
    const rows = await otherDevice.getAllAsync<{ id: number; share_id: string; name: string }>('SELECT id, share_id, name FROM recipe');
    expect(rows).toHaveLength(2);
    const forkedRow = rows.find((r) => r.id === keptBothId);
    expect(forkedRow?.share_id).not.toBe(payload.share_id);
    expect(forkedRow?.name).toContain('(imported)');
  });

  it('name-similar recipes with no share_id match surface for the manual merge tool', async () => {
    await createManualRecipe(db, baseDraft({ name: 'Thai Green Curry' }));
    const otherAuthorId = await createManualRecipe(db, baseDraft({ name: 'Green Curry (Thai)' }));
    // Different lineage entirely — force a fresh share_id so it truly has no match.
    await db.runAsync('DELETE FROM recipe WHERE id = ?', [otherAuthorId]);

    const foreignPayload = await buildSharePayload(db, await createManualRecipe(db, baseDraft({ name: 'Thai green curry' })));
    // Give the foreign payload a share_id nothing local has.
    const withForeignShareId = { ...foreignPayload, share_id: 'totally-different-lineage' };

    const match = await matchImport(db, withForeignShareId);
    expect(match.kind).toBe('name_similar');
  });

  it('merging a name-similar candidate adopts the incoming share_id', async () => {
    const candidateId = await createManualRecipe(db, baseDraft({ name: 'Thai Green Curry' }));
    const originalShareId = (await db.getFirstAsync<{ share_id: string }>('SELECT share_id FROM recipe WHERE id = ?', [candidateId]))!.share_id;

    const foreign = { ...(await buildSharePayload(db, candidateId)), share_id: 'foreign-lineage-id', recipe: { ...(await buildSharePayload(db, candidateId)).recipe, description: "Nana's version" } };

    const match = await matchImport(db, foreign);
    expect(match.kind).toBe('name_similar');

    await importMerge(db, candidateId, foreign, "Nana's phone");

    const row = await db.getFirstAsync<{ share_id: string; description: string; source: string }>(
      'SELECT share_id, description, source FROM recipe WHERE id = ?',
      [candidateId],
    );
    expect(row?.share_id).toBe('foreign-lineage-id');
    expect(row?.share_id).not.toBe(originalShareId);
    expect(row?.description).toBe("Nana's version");
    expect(row?.source).toBe('imported');
  });

  it('flags unresolved ingredients rather than guessing a base unit', async () => {
    const sourceId = await createManualRecipe(
      db,
      baseDraft({ ingredients: [{ canonicalId: null, displayName: 'Made-up ingredient', quantity: 1, unit: 'unit', scalable: true, optional: false }] }),
    );
    const payload = await buildSharePayload(db, sourceId);
    const otherDevice = await createTestDb();
    const resolution = await checkIngredientResolution(otherDevice, payload);
    expect(resolution).toHaveLength(1);
    expect(resolution[0].matched).toBe(false);

    const newId = await importAsNew(otherDevice, payload, null);
    const ing = await otherDevice.getFirstAsync<{ canonical_id: number | null }>(
      'SELECT canonical_id FROM recipe_ingredient WHERE recipe_id = ?',
      [newId],
    );
    expect(ing?.canonical_id).toBeNull();
  });

  it('manual merge tool: kept recipe adopts the duplicate share_id and the duplicate cascades away', async () => {
    const keepId = await createManualRecipe(db, baseDraft({ name: 'My Curry' }));
    const dupId = await createManualRecipe(db, baseDraft({ name: 'Curry (imported)' }));
    await insertCookLog(db, dupId);
    const dupShareId = (await db.getFirstAsync<{ share_id: string }>('SELECT share_id FROM recipe WHERE id = ?', [dupId]))!.share_id;

    await mergeRecipeLineage(db, keepId, dupId, 'duplicate');

    const remaining = await db.getAllAsync<{ id: number }>('SELECT id FROM recipe');
    expect(remaining).toHaveLength(1);
    const kept = await db.getFirstAsync<{ share_id: string }>('SELECT share_id FROM recipe WHERE id = ?', [keepId]);
    expect(kept?.share_id).toBe(dupShareId);

    const logs = await db.getAllAsync('SELECT * FROM cook_log WHERE recipe_id = ?', [dupId]);
    expect(logs).toHaveLength(0);
  });
});
