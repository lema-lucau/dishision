import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { buildCookRefineSeed, buildLeftoverContextFragment, buildPantryContextFragment, buildQuickStarts } from '../../bot/surfaceContext';
import { createTestDb } from '../support/testDb';

describe('surfaceContext (§A2.2)', () => {
  let db: DbClient;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it('pantry/leftover fragments are null when there is nothing', async () => {
    expect(await buildPantryContextFragment(db)).toBeNull();
    expect(await buildLeftoverContextFragment(db)).toBeNull();
  });

  it('the pantry fragment lists items and flags running-low staples', async () => {
    const a = await db.runAsync(`INSERT INTO canonical_ingredient (name, base_unit, source) VALUES ('Rice', 'g', 'seed')`);
    const b = await db.runAsync(`INSERT INTO canonical_ingredient (name, base_unit, source) VALUES ('Soy sauce', 'ml', 'seed')`);
    await db.runAsync('INSERT INTO pantry_item (canonical_id, quantity) VALUES (?, 500)', [a.lastInsertRowId]);
    await db.runAsync('INSERT INTO pantry_item (canonical_id, quantity) VALUES (?, 200)', [b.lastInsertRowId]);
    await db.runAsync('INSERT INTO staple (canonical_id, running_low) VALUES (?, 1)', [b.lastInsertRowId]);

    const fragment = await buildPantryContextFragment(db);
    expect(fragment).toContain('Rice');
    expect(fragment).toContain('Soy sauce');
    expect(fragment).toContain('Running low');
    expect(fragment).toContain('Soy sauce'); // low list
  });

  it('always returns the four quick-start chips, with context only where data exists', async () => {
    const quickStarts = await buildQuickStarts(db);
    expect(quickStarts.map((q) => q.label)).toEqual(['Use up my pantry', 'Something quick', 'Use up leftovers', 'Surprise me']);
    // With an empty db, pantry/leftover chips carry no context.
    expect(quickStarts[0].context).toBeNull();
    expect(quickStarts[2].context).toBeNull();
    // The starter messages are never empty (they prefill the input).
    expect(quickStarts.every((q) => q.message.length > 0)).toBe(true);
  });

  it('builds a cook-refine seed carrying that cook\'s feedback (§A2.3)', async () => {
    const r = await db.runAsync(
      `INSERT INTO recipe (share_id, name, photo_emoji, base_servings, timeline_mode, source) VALUES ('c1', 'Chilli', '🍽️', 4, 'sequential', 'manual')`,
    );
    const recipeId = r.lastInsertRowId;
    const cl = await db.runAsync(
      `INSERT INTO cook_log (recipe_id, cooked_at, servings_made, stars, what_to_change) VALUES (?, '2026-05-01T18:00:00.000Z', 2, 3, 'too salty, needed longer')`,
      [recipeId],
    );
    const cookLogId = cl.lastInsertRowId;
    await db.runAsync(
      `INSERT INTO cook_log_substitution (cook_log_id, original_text, replacement_text, verdict) VALUES (?, 'beef', 'lentils', 'better')`,
      [cookLogId],
    );

    const seed = await buildCookRefineSeed(db, cookLogId);
    expect(seed?.recipeId).toBe(recipeId);
    expect(seed?.recipeName).toBe('Chilli');
    expect(seed?.contextFragment).toContain('3/5');
    expect(seed?.contextFragment).toContain('too salty');
    expect(seed?.contextFragment).toContain('beef → lentils (better)');
    expect(seed?.contextFragment).toContain('written for 4');
    expect(seed?.autoMessage.length).toBeGreaterThan(0);
  });

  it('returns null for a missing cook log', async () => {
    expect(await buildCookRefineSeed(db, 999)).toBeNull();
  });
});
