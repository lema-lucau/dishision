import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { addStaple, loadStaples, removeStaple, removeStaples, setStapleParLevel, setStapleRunningLow } from '../../plan/staples';
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

  it('removes several staples at once', async () => {
    const saltId = await insertIngredient(db, 'Salt');
    const pepperId = await insertIngredient(db, 'Pepper');
    await addStaple(db, saltId);
    await addStaple(db, pepperId);
    await removeStaples(db, [saltId, pepperId]);
    expect(await loadStaples(db)).toHaveLength(0);
  });

  it('with a par level set, running low is calculated from pantry quantity instead of the manual flag', async () => {
    const saltId = await insertIngredient(db);
    await addStaple(db, saltId);
    await setStapleRunningLow(db, saltId, false);
    await setStapleParLevel(db, saltId, 100);
    await db.runAsync('INSERT INTO pantry_item (canonical_id, quantity) VALUES (?, ?)', [saltId, 50]);

    const [lowRow] = await loadStaples(db);
    expect(lowRow).toMatchObject({ parLevel: 100, quantity: 50, manualRunningLow: false, runningLow: true });

    await db.runAsync('UPDATE pantry_item SET quantity = ? WHERE canonical_id = ?', [150, saltId]);
    const [highRow] = await loadStaples(db);
    expect(highRow.runningLow).toBe(false);
  });

  it('falls back to the manual toggle when no par level is set', async () => {
    const saltId = await insertIngredient(db);
    await addStaple(db, saltId);
    await setStapleRunningLow(db, saltId, true);
    const [row] = await loadStaples(db);
    expect(row).toMatchObject({ parLevel: null, manualRunningLow: true, runningLow: true });
  });
});
