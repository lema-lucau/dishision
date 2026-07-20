import { describe, expect, it } from 'vitest';
import { createTestDb } from '../support/testDb';
import { runSeed } from '../../seed/seedRunner';
import { ingredients } from '../../seed/data/ingredients';
import { recipes } from '../../seed/data/recipes';
import { tags } from '../../seed/data/tags';

describe('seed data integrity (§9)', () => {
  it('every recipe ingredient resolves to a canonical ingredient name or alias', () => {
    const known = new Set<string>();
    for (const ing of ingredients) {
      known.add(ing.name.toLowerCase().trim());
      for (const alias of ing.aliases ?? []) known.add(alias.toLowerCase().trim());
    }
    const orphans: string[] = [];
    for (const recipe of recipes) {
      for (const ri of recipe.ingredients) {
        if (!known.has(ri.canonicalName.toLowerCase().trim())) {
          orphans.push(`${recipe.seedId}: ${ri.canonicalName}`);
        }
      }
    }
    expect(orphans).toEqual([]);
  });

  // Fixtures are deliberately lowercase (matched case-insensitively, see
  // ingredients.ts) — the seed runner is the one place that must capitalise
  // them at write time, matching the same rule applied to user-created
  // ingredients/tags (lib/capitalize.ts) and backfilled once for existing
  // rows by migration 002. Regression test for a bug where reseeding kept
  // silently re-lowercasing everything via the seed_id upsert.
  it('capitalises ingredient, alias, tag, and recipe-ingredient names on seed', async () => {
    const db = await createTestDb();
    await runSeed(db);

    const lowercaseIngredients = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM canonical_ingredient WHERE name != UPPER(SUBSTR(name, 1, 1)) || SUBSTR(name, 2)",
    );
    expect(lowercaseIngredients).toEqual([]);

    const lowercaseAliases = await db.getAllAsync<{ alias: string }>(
      "SELECT alias FROM canonical_ingredient_alias WHERE alias != UPPER(SUBSTR(alias, 1, 1)) || SUBSTR(alias, 2)",
    );
    expect(lowercaseAliases).toEqual([]);

    const lowercaseTags = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM tag WHERE name != UPPER(SUBSTR(name, 1, 1)) || SUBSTR(name, 2)",
    );
    expect(lowercaseTags).toEqual([]);

    const lowercaseDisplayNames = await db.getAllAsync<{ display_name: string }>(
      "SELECT display_name FROM recipe_ingredient WHERE display_name != UPPER(SUBSTR(display_name, 1, 1)) || SUBSTR(display_name, 2)",
    );
    expect(lowercaseDisplayNames).toEqual([]);

    expect(ingredients.length).toBeGreaterThan(0);
    expect(tags.length).toBeGreaterThan(0);
  });

  it('every canonical ingredient has complete macros and cost', () => {
    const incomplete = ingredients.filter(
      (i) =>
        i.kcalPer100 == null ||
        i.proteinPer100 == null ||
        i.carbsPer100 == null ||
        i.fatPer100 == null ||
        i.costPer100 == null,
    );
    expect(incomplete.map((i) => i.seedId)).toEqual([]);
  });

  it('ships 42+ recipes', () => {
    expect(recipes.length).toBeGreaterThanOrEqual(42);
  });

  it('every recipe has a distinct, dish-appropriate emoji (never the default 🍽️)', () => {
    const withDefault = recipes.filter((r) => r.photoEmoji === '🍽️');
    expect(withDefault.map((r) => r.seedId)).toEqual([]);
  });

  it('every recipe has at least one tag', () => {
    const untagged = recipes.filter((r) => r.tags.length === 0);
    expect(untagged.map((r) => r.seedId)).toEqual([]);
  });

  it('has a healthy mix of sequential and parallel timelines', () => {
    const parallel = recipes.filter((r) => r.timelineMode === 'parallel');
    const sequential = recipes.filter((r) => r.timelineMode === 'sequential');
    expect(parallel.length).toBeGreaterThanOrEqual(10);
    expect(sequential.length).toBeGreaterThanOrEqual(10);
  });

  it('parallel recipes author lanes + offsets; sequential recipes author neither', () => {
    for (const recipe of recipes) {
      if (recipe.timelineMode === 'parallel') {
        expect((recipe.lanes ?? []).length).toBeGreaterThanOrEqual(2);
        for (const step of recipe.steps) {
          expect(step.lane).toBeTruthy();
        }
      } else {
        for (const step of recipe.steps) {
          expect(step.lane).toBeUndefined();
          expect(step.startOffsetSeconds).toBeUndefined();
        }
      }
    }
  });

  it('every recipe mixes active and passive steps', () => {
    const missingMix = recipes.filter((r) => {
      const efforts = new Set(r.steps.map((s) => s.effort ?? 'active'));
      return !efforts.has('active') || !efforts.has('passive');
    });
    expect(missingMix.map((r) => r.seedId)).toEqual([]);
  });

  it('at least 30 recipes carry a non-scalable ingredient', () => {
    const count = recipes.filter((r) => r.ingredients.some((i) => i.scalable === false)).length;
    expect(count).toBeGreaterThanOrEqual(30);
  });

  it('at least 15 recipes carry an optional ingredient', () => {
    const count = recipes.filter((r) => r.ingredients.some((i) => i.optional === true)).length;
    expect(count).toBeGreaterThanOrEqual(15);
  });
});

describe('seed runner (§9.3)', () => {
  it('seeds the full library with complete macros, costs, and emoji', async () => {
    const db = await createTestDb();
    const summary = await runSeed(db);
    expect(summary.recipeCount).toBe(recipes.length);

    const recipeRows = await db.getAllAsync<{ id: number }>("SELECT id FROM recipe WHERE source = 'seed'");
    expect(recipeRows.length).toBe(recipes.length);

    const unresolved = await db.getAllAsync(
      'SELECT * FROM recipe_ingredient WHERE canonical_id IS NULL',
    );
    expect(unresolved).toEqual([]);
  });

  it('is idempotent — re-running changes nothing observable', async () => {
    const db = await createTestDb();
    await runSeed(db);
    const before = await db.getAllAsync('SELECT id, name, seed_id FROM recipe ORDER BY seed_id');
    await runSeed(db);
    const after = await db.getAllAsync('SELECT id, name, seed_id FROM recipe ORDER BY seed_id');
    expect(after).toEqual(before);

    const ingredientCount = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) as n FROM canonical_ingredient',
    );
    expect(ingredientCount?.n).toBe(ingredients.length);
  });

  it('restore: deleting a seeded recipe then reseeding brings it back; manual recipes are untouched', async () => {
    const db = await createTestDb();
    await runSeed(db);
    const target = await db.getFirstAsync<{ id: number; seed_id: string }>(
      "SELECT id, seed_id FROM recipe WHERE source = 'seed' LIMIT 1",
    );
    expect(target).toBeTruthy();

    await db.runAsync(
      "INSERT INTO recipe (share_id, name, source) VALUES ('manual-share', 'My own recipe', 'manual')",
    );

    await db.runAsync('DELETE FROM recipe WHERE id = ?', [target!.id]);
    const goneCheck = await db.getFirstAsync('SELECT id FROM recipe WHERE seed_id = ?', [target!.seed_id]);
    expect(goneCheck).toBeNull();

    await runSeed(db);
    const restored = await db.getFirstAsync('SELECT id FROM recipe WHERE seed_id = ?', [target!.seed_id]);
    expect(restored).toBeTruthy();

    const manual = await db.getFirstAsync("SELECT id FROM recipe WHERE share_id = 'manual-share'");
    expect(manual).toBeTruthy();
  });
});
