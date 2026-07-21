import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { ensureProfile } from '../../profile/ensureProfile';
import { createUserIngredient } from '../../recipes/ingredientSearch';
import { createManualRecipe, type RecipeDraft } from '../../recipes/recipeSave';
import { setSetting } from '../../settings/setSetting';
import { buildBackup, serializeBackup, BACKUP_VERSION } from '../../backup/exportData';
import { BackupValidationError, parseBackup, restoreBackup } from '../../backup/restoreData';
import { computeTableOrder, listUserTables } from '../../backup/tableOrder';
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
    ingredients: [],
    steps: [],
    tags: ['chicken'],
    ...overrides,
  };
}

async function seedRealData(db: DbClient) {
  await ensureProfile(db, 'Lema');
  const chicken = await createUserIngredient(db, 'Chicken thigh', 'g');
  const recipeId = await createManualRecipe(
    db,
    baseDraft({ ingredients: [{ canonicalId: chicken.id, displayName: 'Chicken thigh', quantity: 400, unit: 'g', scalable: true, optional: false }] }),
  );
  await db.runAsync(
    `INSERT INTO cook_log (recipe_id, cooked_at, servings_made, servings_eaten, stars, notes) VALUES (?, '2026-07-14T18:00:00Z', 2, 2, 4, 'Great, would repeat')`,
    [recipeId],
  );
  await setSetting(db, 'theme', 'ember');
  await db.runAsync('INSERT INTO household_member (person_id, display_name, avatar_emoji, sync_secret) VALUES (?, ?, ?, ?)', [
    'person-1',
    'Tara',
    '🥑',
    'deadbeefdeadbeef',
  ]);
  return { recipeId, chickenId: chicken.id };
}

describe('tableOrder (§10)', () => {
  it('computes a topological order where every table appears exactly once, parents before children', async () => {
    const db = await createTestDb();
    const tables = await listUserTables(db);
    const order = await computeTableOrder(db);
    expect(new Set(order)).toEqual(new Set(tables));
    expect(order.indexOf('canonical_ingredient')).toBeLessThan(order.indexOf('recipe_ingredient'));
    expect(order.indexOf('recipe')).toBeLessThan(order.indexOf('recipe_ingredient'));
    expect(order.indexOf('recipe')).toBeLessThan(order.indexOf('cook_log'));
    expect(order.indexOf('cook_log')).toBeLessThan(order.indexOf('leftover'));
    expect(order.indexOf('household_member')).toBeLessThan(order.indexOf('household_rating'));
  });
});

describe('backup export/restore (§10)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('export -> wipe -> restore reproduces identical state, including household members (S14 verify criterion)', async () => {
    const { recipeId } = await seedRealData(db);
    const backup = await buildBackup(db);
    expect(backup.version).toBe(BACKUP_VERSION);

    const wireParsed = parseBackup(serializeBackup(backup));

    // Simulate a wipe: mutate everything so a naive "restore" that no-ops
    // would be caught by these assertions failing.
    await db.runAsync('DELETE FROM recipe');
    await db.runAsync('DELETE FROM household_member');
    await db.runAsync("UPDATE setting SET value = 'hearth' WHERE key = 'theme'");
    await createManualRecipe(db, baseDraft({ name: 'Junk recipe that should not survive restore' }));

    await restoreBackup(db, wireParsed);

    const recipe = await db.getFirstAsync<{ id: number; name: string }>('SELECT id, name FROM recipe WHERE id = ?', [recipeId]);
    expect(recipe?.name).toBe('Thai Green Curry');

    const junk = await db.getFirstAsync('SELECT id FROM recipe WHERE name = ?', ['Junk recipe that should not survive restore']);
    expect(junk).toBeNull();

    const cookLog = await db.getFirstAsync<{ notes: string }>('SELECT notes FROM cook_log WHERE recipe_id = ?', [recipeId]);
    expect(cookLog?.notes).toBe('Great, would repeat');

    const theme = await db.getFirstAsync<{ value: string }>('SELECT value FROM setting WHERE key = ?', ['theme']);
    expect(theme?.value).toBe('ember');

    const member = await db.getFirstAsync<{ display_name: string; sync_secret: string }>(
      'SELECT display_name, sync_secret FROM household_member WHERE person_id = ?',
      ['person-1'],
    );
    expect(member?.display_name).toBe('Tara');
    expect(member?.sync_secret).toBe('deadbeefdeadbeef');

    const recipeCount = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM recipe');
    expect(recipeCount?.c).toBe(1);
  });

  it('a failure mid-restore leaves the previous state untouched', async () => {
    await seedRealData(db);
    const backup = await buildBackup(db);
    // Corrupt one table's rows so the INSERT phase fails partway through.
    (backup.tables.recipe as any)[0].timeline_mode = null; // NOT NULL violation

    const before = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM recipe');
    await expect(restoreBackup(db, backup)).rejects.toThrow();
    const after = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM recipe');
    expect(after?.c).toBe(before?.c);
  });

  it('rejects a forward-incompatible (newer) backup version without touching the DB', async () => {
    await seedRealData(db);
    const json = JSON.stringify({ version: BACKUP_VERSION + 1, exportedAt: new Date().toISOString(), tables: {} });
    expect(() => parseBackup(json)).toThrow(BackupValidationError);

    const count = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM recipe');
    expect(count?.c).toBe(1);
  });

  it('rejects malformed backup files', () => {
    expect(() => parseBackup('{not json')).toThrow(BackupValidationError);
    expect(() => parseBackup(JSON.stringify({ version: 1 }))).toThrow(BackupValidationError);
  });
});
