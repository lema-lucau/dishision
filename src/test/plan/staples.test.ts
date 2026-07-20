import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { addStaple, loadStaples, removeStaple, setStapleRunningLow } from '../../plan/staples';
import { createTestDb } from '../support/testDb';

async function insertIngredient(db: DbClient, name = 'Salt'): Promise<number> {
  const result = await db.runAsync('INSERT INTO canonical_ingredient (name, base_unit, source) VALUES (?, ?, ?)', [name, 'g', 'seed']);
  return result.lastInsertRowId;
}

describe('staples (§5.8)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('adds and lists a staple, not running low by default', async () => {
    const saltId = await insertIngredient(db);
    await addStaple(db, saltId);
    const [row] = await loadStaples(db);
    expect(row).toMatchObject({ canonicalId: saltId, name: 'Salt', runningLow: false });
  });

  it('toggles running low', async () => {
    const saltId = await insertIngredient(db);
    await addStaple(db, saltId);
    await setStapleRunningLow(db, saltId, true);
    const [row] = await loadStaples(db);
    expect(row.runningLow).toBe(true);
  });

  it('removes a staple', async () => {
    const saltId = await insertIngredient(db);
    await addStaple(db, saltId);
    await removeStaple(db, saltId);
    expect(await loadStaples(db)).toHaveLength(0);
  });
});
