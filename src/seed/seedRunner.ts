// Idempotent seed runner (§9.3). Upserts on seed_id; re-running produces the
// same end state. Recipe children (ingredients/lanes/steps/tags) have no
// stable identity of their own, so each run deletes and reinserts them for
// their parent recipe — the parent row itself is a true upsert, so a
// user-visible id (recipe.id) never changes across reseeds.
import { uuidv4 } from '../utils/uuid';
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { capitalize } from '../lib/capitalize';
import { inferIngredientCategory } from '../lib/ingredientCategory';
import { ingredients as seedIngredients } from './data/ingredients';
import { recipes as seedRecipes } from './data/recipes';
import { tags as seedTags } from './data/tags';
import type { IngredientFixture, RecipeFixture, TagFixture } from './types';

export interface SeedSummary {
  ingredientCount: number;
  tagCount: number;
  recipeCount: number;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function upsertIngredient(db: DbClient, ing: IngredientFixture): Promise<number> {
  const category = ing.category ?? inferIngredientCategory(ing.name);
  await db.runAsync(
    `INSERT INTO canonical_ingredient
       (seed_id, name, base_unit, pack_size, pack_label, kcal_per_100, protein_per_100,
        carbs_per_100, fat_per_100, cost_per_100, cost_updated_at, density, category, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, 'seed')
     ON CONFLICT(seed_id) DO UPDATE SET
       name = excluded.name,
       base_unit = excluded.base_unit,
       pack_size = excluded.pack_size,
       pack_label = excluded.pack_label,
       kcal_per_100 = excluded.kcal_per_100,
       protein_per_100 = excluded.protein_per_100,
       carbs_per_100 = excluded.carbs_per_100,
       fat_per_100 = excluded.fat_per_100,
       cost_per_100 = excluded.cost_per_100,
       density = excluded.density,
       category = excluded.category,
       updated_at = datetime('now')`,
    [
      ing.seedId,
      capitalize(ing.name),
      ing.baseUnit,
      ing.packSize ?? null,
      ing.packLabel ?? null,
      ing.kcalPer100 ?? null,
      ing.proteinPer100 ?? null,
      ing.carbsPer100 ?? null,
      ing.fatPer100 ?? null,
      ing.costPer100 ?? null,
      ing.density ?? null,
      category,
    ],
  );
  const row = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM canonical_ingredient WHERE seed_id = ?',
    [ing.seedId],
  );
  if (!row) throw new Error(`Ingredient upsert failed to produce a row: ${ing.seedId}`);

  for (const alias of ing.aliases ?? []) {
    await db.runAsync(
      'INSERT OR IGNORE INTO canonical_ingredient_alias (canonical_id, alias) VALUES (?, ?)',
      [row.id, capitalize(alias)],
    );
  }

  return row.id;
}

async function upsertTag(db: DbClient, tag: TagFixture): Promise<number> {
  await db.runAsync(
    `INSERT INTO tag (seed_id, name, type, colour)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(seed_id) DO UPDATE SET name = excluded.name, type = excluded.type, colour = excluded.colour`,
    [tag.seedId, capitalize(tag.name), tag.type, tag.colour ?? null],
  );
  const row = await db.getFirstAsync<{ id: number }>('SELECT id FROM tag WHERE seed_id = ?', [tag.seedId]);
  if (!row) throw new Error(`Tag upsert failed to produce a row: ${tag.seedId}`);
  return row.id;
}

// Ingredient/tag name resolution is case-insensitive by trimmed lowercase —
// recipe fixtures reference canonical names/aliases as free text.
function buildNameIndex(): Map<string, number> {
  return new Map<string, number>();
}

async function seedIngredientsAndBuildIndex(db: DbClient): Promise<Map<string, number>> {
  const index = buildNameIndex();
  for (const ing of seedIngredients) {
    const id = await upsertIngredient(db, ing);
    index.set(ing.name.toLowerCase().trim(), id);
    for (const alias of ing.aliases ?? []) {
      index.set(alias.toLowerCase().trim(), id);
    }
  }
  return index;
}

async function seedTagsAndBuildIndex(db: DbClient): Promise<Map<string, number>> {
  const index = buildNameIndex();
  for (const tag of seedTags) {
    const id = await upsertTag(db, tag);
    index.set(tag.name.toLowerCase().trim(), id);
  }
  return index;
}

async function resolveOrCreateTag(db: DbClient, name: string, index: Map<string, number>): Promise<number> {
  const key = name.toLowerCase().trim();
  const existing = index.get(key);
  if (existing != null) return existing;
  const id = await upsertTag(db, { seedId: `tag-${slugify(name)}`, name, type: 'custom' });
  index.set(key, id);
  return id;
}

async function deleteRecipeChildren(db: DbClient, recipeId: number): Promise<void> {
  await db.runAsync('DELETE FROM recipe_step WHERE recipe_id = ?', [recipeId]);
  await db.runAsync('DELETE FROM step_lane WHERE recipe_id = ?', [recipeId]);
  await db.runAsync('DELETE FROM recipe_ingredient WHERE recipe_id = ?', [recipeId]);
  await db.runAsync('DELETE FROM recipe_tag WHERE recipe_id = ?', [recipeId]);
}

async function upsertRecipe(
  db: DbClient,
  fixture: RecipeFixture,
  ingredientIndex: Map<string, number>,
  tagIndex: Map<string, number>,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO recipe
       (seed_id, share_id, name, description, photo_emoji, base_servings, timeline_mode,
        source, origin_label, origin_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'seed', ?, ?)
     ON CONFLICT(seed_id) DO UPDATE SET
       name = excluded.name,
       description = excluded.description,
       photo_emoji = excluded.photo_emoji,
       base_servings = excluded.base_servings,
       timeline_mode = excluded.timeline_mode,
       origin_label = excluded.origin_label,
       origin_url = excluded.origin_url,
       updated_at = datetime('now')`,
    [
      fixture.seedId,
      uuidv4(),
      fixture.name,
      fixture.description ?? null,
      fixture.photoEmoji,
      fixture.baseServings ?? 2,
      fixture.timelineMode,
      fixture.originLabel ?? null,
      fixture.originUrl ?? null,
    ],
  );

  const row = await db.getFirstAsync<{ id: number }>('SELECT id FROM recipe WHERE seed_id = ?', [fixture.seedId]);
  if (!row) throw new Error(`Recipe upsert failed to produce a row: ${fixture.seedId}`);
  const recipeId = row.id;

  await deleteRecipeChildren(db, recipeId);

  const laneIds = new Map<string, number>();
  for (const [index, laneName] of (fixture.lanes ?? []).entries()) {
    const result = await db.runAsync(
      'INSERT INTO step_lane (recipe_id, name, sort_order) VALUES (?, ?, ?)',
      [recipeId, laneName, index],
    );
    laneIds.set(laneName, result.lastInsertRowId);
  }

  for (const [index, ing] of fixture.ingredients.entries()) {
    const canonicalId = ingredientIndex.get(ing.canonicalName.toLowerCase().trim()) ?? null;
    if (canonicalId == null) {
      logger.error('db', 'Unresolved ingredient reference', {
        recipe: fixture.seedId,
        canonicalName: ing.canonicalName,
      });
    }
    await db.runAsync(
      `INSERT INTO recipe_ingredient
         (recipe_id, canonical_id, display_name, quantity, unit, scalable, optional, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        recipeId,
        canonicalId,
        capitalize(ing.displayName ?? ing.canonicalName),
        ing.quantity,
        ing.unit,
        ing.scalable === false ? 0 : 1,
        ing.optional === true ? 1 : 0,
        index,
      ],
    );
  }

  for (const [index, step] of fixture.steps.entries()) {
    const laneId = step.lane != null ? laneIds.get(step.lane) ?? null : null;
    await db.runAsync(
      `INSERT INTO recipe_step
         (recipe_id, lane_id, phase, instruction, duration_seconds, start_offset_seconds,
          effort, important, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        recipeId,
        laneId,
        step.phase,
        step.instruction,
        step.durationSeconds ?? null,
        fixture.timelineMode === 'parallel' ? step.startOffsetSeconds ?? 0 : 0,
        step.effort ?? 'active',
        step.important ? 1 : 0,
        index,
      ],
    );
  }

  for (const tagName of fixture.tags) {
    const tagId = await resolveOrCreateTag(db, tagName, tagIndex);
    await db.runAsync('INSERT OR IGNORE INTO recipe_tag (recipe_id, tag_id) VALUES (?, ?)', [recipeId, tagId]);
  }
}

// Runs the full seed (§9.1-9.3): ingredients and tags first (recipes
// reference both by name), then recipes. Wrapped in one transaction so a
// failure partway through never leaves a half-seeded library.
export async function runSeed(db: DbClient): Promise<SeedSummary> {
  await db.execAsync('BEGIN');
  try {
    const ingredientIndex = await seedIngredientsAndBuildIndex(db);
    const tagIndex = await seedTagsAndBuildIndex(db);
    for (const recipe of seedRecipes) {
      await upsertRecipe(db, recipe, ingredientIndex, tagIndex);
    }
    await db.execAsync('COMMIT');
  } catch (error) {
    await db.execAsync('ROLLBACK');
    logger.error('db', 'Seed run failed, rolled back', { error: String(error) });
    throw error;
  }

  const summary: SeedSummary = {
    ingredientCount: seedIngredients.length,
    tagCount: seedTags.length,
    recipeCount: seedRecipes.length,
  };
  logger.info('db', 'Seed run complete', summary);
  return summary;
}

// Restore a single deleted seeded recipe by seed_id (§9.3) without touching
// the rest of the library. No-op if the seed_id is unknown.
export async function restoreSeedRecipe(db: DbClient, seedId: string): Promise<boolean> {
  const fixture = seedRecipes.find((r) => r.seedId === seedId);
  if (!fixture) return false;
  const ingredientIndex = await seedIngredientsAndBuildIndex(db);
  const tagIndex = await seedTagsAndBuildIndex(db);
  await upsertRecipe(db, fixture, ingredientIndex, tagIndex);
  return true;
}
