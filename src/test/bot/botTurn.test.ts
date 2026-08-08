import { beforeEach, describe, expect, it, vi } from 'vitest';

// The API key lives in SecureStore (a native module absent under vitest); mock
// it so the orchestration can run against a fake fetch.
vi.mock('../../bot/apiKeyStore', () => ({
  getApiKey: async () => 'sk-ant-test',
  hasApiKey: async () => true,
}));

import type { DbClient } from '../../db/DbClient';
import { createChat, getChat, getMessages } from '../../bot/chatRepo';
import { sendUserTurn } from '../../bot/botTurn';
import { DEFAULT_BOT_SETTINGS } from '../../bot/types';
import { createTestDb } from '../support/testDb';

function fakeFetch(body: unknown): typeof fetch {
  return (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => body,
    }) as unknown as Response) as unknown as typeof fetch;
}

const toolResponse = {
  model: 'claude-haiku-4-5-20251001',
  content: [
    { type: 'text', text: "Here's a quick soup." },
    {
      type: 'tool_use',
      name: 'propose_recipe',
      input: {
        name: 'Miso Soup',
        base_servings: 2,
        ingredients: [{ display_name: 'miso paste', quantity: 2, unit: 'tbsp' }],
        lanes: [{ name: 'Main', steps: [{ instruction: 'Whisk miso into dashi.', duration_seconds: 300, effort: 'low' }] }],
      },
    },
  ],
  usage: { input_tokens: 200, output_tokens: 80 },
};

describe('sendUserTurn orchestration (§7, §12)', () => {
  let db: DbClient;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it('persists both messages, updates the draft, resolves ingredients, and logs usage', async () => {
    const chat = await createChat(db, { source: 'chat', settings: { ...DEFAULT_BOT_SETTINGS } });
    const result = await sendUserTurn(db, chat, 'make me a quick soup', 'Lema', { fetchImpl: fakeFetch(toolResponse) });

    // Both turns persisted.
    const messages = await getMessages(db, chat.id);
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[1].content).toContain('quick soup');

    // Draft persisted on the chat.
    const reloaded = await getChat(db, chat.id);
    expect(reloaded?.draft?.name).toBe('Miso Soup');

    // Proposal mapped + ingredient auto-created (§6) and flagged new.
    expect(result.proposal?.draft.name).toBe('Miso Soup');
    expect(result.proposal?.newIngredientNames.has('miso paste')).toBe(true);
    const canon = await db.getFirstAsync('SELECT id FROM canonical_ingredient WHERE name = ?', ['Miso paste']);
    expect(canon).not.toBeNull();

    // Usage logged with a cost (§12), tagged with the surface it came from (§A1.4).
    const usage = await db.getFirstAsync<{ input_tokens: number; estimated_cost: number; surface: string }>(
      'SELECT input_tokens, estimated_cost, surface FROM bot_usage_log',
    );
    expect(usage?.input_tokens).toBe(200);
    expect(usage?.estimated_cost).toBeGreaterThan(0);
    expect(usage?.surface).toBe('recipe_chat');
  });

  it('keeps the user message saved and returns no proposal for a clarifying reply', async () => {
    const chat = await createChat(db, { source: 'chat', settings: { ...DEFAULT_BOT_SETTINGS } });
    const clarifying = { model: 'claude-haiku-4-5-20251001', content: [{ type: 'text', text: 'How many servings?' }], usage: { input_tokens: 30, output_tokens: 8 } };
    const result = await sendUserTurn(db, chat, 'something with rice', 'Lema', { fetchImpl: fakeFetch(clarifying) });
    expect(result.proposal).toBeNull();
    const messages = await getMessages(db, chat.id);
    expect(messages).toHaveLength(2);
    expect(messages[1].content).toBe('How many servings?');
  });
});
