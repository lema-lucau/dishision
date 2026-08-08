// §7.4: context-window management. Recipe chats are naturally short, so the
// default is to send the whole transcript verbatim. Only when a chat runs long
// past a generous budget do we summarise the *older* portion and keep the most
// recent messages verbatim. The current recipe candidate is carried separately
// in the system prompt's CURRENT RECIPE STATE (systemPrompt.ts), so it's never
// re-derived from history and summarisation loss has low blast radius.
import type { ApiMessage } from './anthropicClient';
import type { BotMessage } from './types';

const MAX_VERBATIM_MESSAGES = 50;
const TOKEN_BUDGET = 12_000;
const KEEP_RECENT = 14;

// Rough char→token estimate (~4 chars/token) — good enough to decide whether
// we're anywhere near the budget, which almost no recipe chat will be.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function totalTokens(messages: { content: string }[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}

// Condense the older portion into a single recap line. Deliberately cheap and
// local (no extra API round-trip): it just preserves the gist of what was
// discussed, since the authoritative recipe state travels in the system prompt.
function summariseOlder(older: BotMessage[]): string {
  const lines = older.map((m) => {
    const who = m.role === 'user' ? 'User' : 'Dishision Bot';
    const text = m.content.replace(/\s+/g, ' ').trim();
    return `${who}: ${text.length > 240 ? `${text.slice(0, 240)}…` : text}`;
  });
  let recap = lines.join('\n');
  if (estimateTokens(recap) > TOKEN_BUDGET / 2) {
    // Still too long — keep the tail of the recap, which is the most recent of
    // the older messages and the most relevant to what follows.
    const budgetChars = (TOKEN_BUDGET / 2) * 4;
    recap = `…${recap.slice(recap.length - budgetChars)}`;
  }
  return `[Earlier in this conversation, summarised]\n${recap}`;
}

// Coalesce consecutive same-role messages so the request never sends two user
// (or two assistant) turns back to back, and always begins with a user turn.
function normalise(messages: ApiMessage[]): ApiMessage[] {
  const out: ApiMessage[] = [];
  for (const m of messages) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) {
      last.content = `${last.content}\n\n${m.content}`;
    } else {
      out.push({ ...m });
    }
  }
  while (out.length > 0 && out[0].role !== 'user') out.shift();
  return out;
}

export function buildApiMessages(history: BotMessage[]): ApiMessage[] {
  const asApi = (m: BotMessage): ApiMessage => ({ role: m.role, content: m.content });

  if (history.length <= MAX_VERBATIM_MESSAGES && totalTokens(history) <= TOKEN_BUDGET) {
    return normalise(history.map(asApi));
  }

  const recent = history.slice(-KEEP_RECENT);
  const older = history.slice(0, -KEEP_RECENT);
  const summary: ApiMessage = { role: 'user', content: summariseOlder(older) };
  return normalise([summary, ...recent.map(asApi)]);
}
