// §5.4 bulk un-exclude. The rule that matters: clearing one kind must not
// touch the other — tonight's dismissals and "never again" are different
// decisions, and one button must not undo both.
import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { clearExclusionsOfKind, setExclusion } from '../../recipes/recipeMutations';
import { createTestDb } from '../support/testDb';

async function insertRecipe(db: DbClient, name: string): Promise<number> {
  const row = await db.runAsync(
    `INSERT INTO recipe (share_id, name, photo_emoji, base_servings, timeline_mode, source) VALUES (?, ?, '🍽️', 2, 'sequential', 'manual')`,
    [`share-${name}`, name],
  );
  return row.lastInsertRowId;
}

async function kinds(db: DbClient): Promise<string[]> {
  const rows = await db.getAllAsync<{ kind: string }>('SELECT kind FROM recipe_exclusion ORDER BY recipe_id');
  return rows.map((r) => r.kind);
}

describe('clearExclusionsOfKind (§5.4)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('clears every not_tonight and leaves never_again standing', async () => {
    const a = await insertRecipe(db, 'A');
    const b = await insertRecipe(db, 'B');
    const c = await insertRecipe(db, 'C');
    await setExclusion(db, a, 'not_tonight');
    await setExclusion(db, b, 'not_tonight');
    await setExclusion(db, c, 'never_again');

    expect(await clearExclusionsOfKind(db, 'not_tonight')).toBe(2);
    expect(await kinds(db)).toEqual(['never_again']);
  });

  it('clears every never_again and leaves tonight alone', async () => {
    const a = await insertRecipe(db, 'A');
    const b = await insertRecipe(db, 'B');
    await setExclusion(db, a, 'never_again');
    await setExclusion(db, b, 'not_tonight');

    expect(await clearExclusionsOfKind(db, 'never_again')).toBe(1);
    expect(await kinds(db)).toEqual(['not_tonight']);
  });

  it('reports zero rather than failing when there is nothing to clear', async () => {
    expect(await clearExclusionsOfKind(db, 'never_again')).toBe(0);
  });
});
