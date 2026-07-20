// "View all ingredients" (Recipes tab): paginated/searchable admin list over
// canonical_ingredient, plus the delete-guard — an ingredient referenced by
// any recipe_ingredient row can't be deleted outright, since that would
// silently orphan every recipe using it.
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { capitalize } from '../lib/capitalize';
import type { IngredientCategory } from '../lib/ingredientCategory';
import type { BaseUnit } from '../seed/types';

export interface IngredientAdminRow {
  id: number;
  name: string;
  baseUnit: BaseUnit;
  packLabel: string | null;
  usageCount: number;
}

export interface IngredientsPage {
  items: IngredientAdminRow[];
  total: number;
}

export type IngredientSort = 'name' | 'usage';
export type IngredientSortDirection = 'asc' | 'desc';

export async function loadIngredientsPage(
  db: DbClient,
  opts: { search?: string; page: number; pageSize: number; sort?: IngredientSort; direction?: IngredientSortDirection },
): Promise<IngredientsPage> {
  const needle = `%${(opts.search ?? '').trim()}%`;
  const offset = (opts.page - 1) * opts.pageSize;
  const dir = opts.direction === 'desc' ? 'DESC' : 'ASC';
  const orderBy =
    opts.sort === 'usage' ? `usage_count ${dir}, ci.name ASC` : `ci.name ${dir}`;

  const totalRow = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM canonical_ingredient WHERE name LIKE ?',
    [needle],
  );

  const rows = await db.getAllAsync<{
    id: number;
    name: string;
    base_unit: BaseUnit;
    pack_label: string | null;
    usage_count: number;
  }>(
    `SELECT ci.id, ci.name, ci.base_unit, ci.pack_label, COUNT(ri.id) as usage_count
     FROM canonical_ingredient ci
     LEFT JOIN recipe_ingredient ri ON ri.canonical_id = ci.id
     WHERE ci.name LIKE ?
     GROUP BY ci.id
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    [needle, opts.pageSize, offset],
  );

  return {
    total: totalRow?.count ?? 0,
    items: rows.map((r) => ({ id: r.id, name: r.name, baseUnit: r.base_unit, packLabel: r.pack_label, usageCount: r.usage_count })),
  };
}

export interface CreateIngredientInput {
  name: string;
  baseUnit: BaseUnit;
  packSize?: number | null;
  packLabel?: string | null;
  category: IngredientCategory;
  density?: number | null;
  kcalPer100?: number | null;
  proteinPer100?: number | null;
  carbsPer100?: number | null;
  fatPer100?: number | null;
  costPer100?: number | null;
}

export async function createIngredient(db: DbClient, input: CreateIngredientInput): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO canonical_ingredient
       (name, base_unit, pack_size, pack_label, category, density,
        kcal_per_100, protein_per_100, carbs_per_100, fat_per_100, cost_per_100, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user')`,
    [
      capitalize(input.name.trim()),
      input.baseUnit,
      input.packSize ?? null,
      input.packLabel ?? null,
      input.category,
      input.density ?? null,
      input.kcalPer100 ?? null,
      input.proteinPer100 ?? null,
      input.carbsPer100 ?? null,
      input.fatPer100 ?? null,
      input.costPer100 ?? null,
    ],
  );
  logger.info('db', 'Ingredient created', { id: result.lastInsertRowId, name: input.name });
  return result.lastInsertRowId;
}

export interface RecipeUsingIngredient {
  id: number;
  name: string;
  photoEmoji: string;
}

export async function loadRecipesUsingIngredient(db: DbClient, canonicalId: number): Promise<RecipeUsingIngredient[]> {
  const rows = await db.getAllAsync<{ id: number; name: string; photo_emoji: string }>(
    `SELECT DISTINCT r.id, r.name, r.photo_emoji
     FROM recipe r
     JOIN recipe_ingredient ri ON ri.recipe_id = r.id
     WHERE ri.canonical_id = ?
     ORDER BY r.name`,
    [canonicalId],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, photoEmoji: r.photo_emoji }));
}

// Guards against deleting an ingredient still referenced by a recipe — the
// UI is expected to check loadRecipesUsingIngredient first and only call
// this once it knows the count is zero, but the guard here is the one that
// actually protects the data if that check is ever skipped or stale.
export async function deleteIngredient(db: DbClient, canonicalId: number): Promise<void> {
  const inUse = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM recipe_ingredient WHERE canonical_id = ?',
    [canonicalId],
  );
  if ((inUse?.count ?? 0) > 0) {
    throw new Error(`Ingredient ${canonicalId} is still used by ${inUse!.count} recipe(s)`);
  }
  await db.runAsync('DELETE FROM canonical_ingredient WHERE id = ?', [canonicalId]);
  logger.info('db', 'Ingredient deleted', { canonicalId });
}
