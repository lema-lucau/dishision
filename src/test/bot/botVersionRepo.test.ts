import { beforeEach, describe, expect, it } from 'vitest';
import type { DbClient } from '../../db/DbClient';
import { createChat } from '../../bot/chatRepo';
import { countVersions, listVersions, writeVersion } from '../../bot/botVersionRepo';
import type { BotDiffChange } from '../../bot/botRecipeDiff';
import { DEFAULT_BOT_SETTINGS, type ProposedRecipe } from '../../bot/types';
import { createTestDb } from '../support/testDb';

const settings = { ...DEFAULT_BOT_SETTINGS };

function recipe(name: string): ProposedRecipe {
  return { name, ingredients: [{ display_name: 'onion', quantity: 1, unit: 'unit' }], lanes: [{ name: 'Main', steps: [{ instruction: 'Cook.' }] }] };
}

function change(id: string): BotDiffChange {
  return { id, group: 'field', section: 'Name', changeType: 'modified', oldText: 'A', newText: 'B' };
}

describe('botVersionRepo (§B2)', () => {
  let db: DbClient;
  let chatId: string;
  beforeEach(async () => {
    db = await createTestDb();
    chatId = (await createChat(db, { source: 'chat', settings })).id;
  });

  it('assigns monotonic, 0-based version indexes per chat', async () => {
    expect(await writeVersion(db, chatId, recipe('v0'), null, 'Initial recipe')).toBe(0);
    expect(await writeVersion(db, chatId, recipe('v1'), [change('c1')])).toBe(1);
    expect(await writeVersion(db, chatId, recipe('v2'), [change('c2')])).toBe(2);
    expect(await countVersions(db, chatId)).toBe(3);
    const list = await listVersions(db, chatId);
    // Newest first.
    expect(list.map((v) => v.versionIndex)).toEqual([2, 1, 0]);
  });

  it('stores only the accepted changes as the summary, null for the initial', async () => {
    await writeVersion(db, chatId, recipe('v0'), null, 'Initial recipe');
    await writeVersion(db, chatId, recipe('v1'), [change('kept-1'), change('kept-2')]);
    const [head, initial] = await listVersions(db, chatId);
    expect(initial.changeSummary).toBeNull();
    expect(initial.label).toBe('Initial recipe');
    expect(head.changeSummary?.map((c) => c.id)).toEqual(['kept-1', 'kept-2']);
  });

  it('appends linearly when a restored version continues (never truncates)', async () => {
    await writeVersion(db, chatId, recipe('v0'), null, 'Initial recipe'); // 0
    await writeVersion(db, chatId, recipe('v1'), [change('c1')]); // 1
    await writeVersion(db, chatId, recipe('v2'), [change('c2')]); // 2
    // Restore v0 → appends a new head at index 3, keeping 0..2 intact.
    const restoredIndex = await writeVersion(db, chatId, recipe('v0'), null, 'Restored v1'); // 3
    expect(restoredIndex).toBe(3);
    // A refine after the restore appends 4.
    expect(await writeVersion(db, chatId, recipe('v0-tweaked'), [change('c3')])).toBe(4);
    const list = await listVersions(db, chatId);
    expect(list.map((v) => v.versionIndex)).toEqual([4, 3, 2, 1, 0]);
    expect(list.find((v) => v.versionIndex === 3)?.label).toBe('Restored v1');
  });

  it('keeps versions isolated per chat', async () => {
    const other = (await createChat(db, { source: 'chat', settings })).id;
    await writeVersion(db, chatId, recipe('a'), null);
    await writeVersion(db, other, recipe('b'), null);
    expect(await writeVersion(db, other, recipe('b2'), [change('x')])).toBe(1);
    expect(await countVersions(db, chatId)).toBe(1);
  });
});
