import { describe, expect, it } from 'vitest';
import { buildApiMessages, estimateTokens } from '../../bot/contextWindow';
import type { BotMessage } from '../../bot/types';

function msg(role: 'user' | 'assistant', content: string, i: number): BotMessage {
  return { id: `m${i}`, chatId: 'c1', role, content, createdAt: `2026-08-07T00:00:${String(i).padStart(2, '0')}Z` };
}

function transcript(n: number, len = 20): BotMessage[] {
  return Array.from({ length: n }, (_, i) => msg(i % 2 === 0 ? 'user' : 'assistant', `${'x'.repeat(len)}#${i}`, i));
}

describe('buildApiMessages (§7.4)', () => {
  it('sends a short transcript verbatim', () => {
    const history = transcript(6);
    const out = buildApiMessages(history);
    expect(out).toHaveLength(6);
    expect(out[0].role).toBe('user');
    expect(out[0].content).toBe(history[0].content);
  });

  it('always begins with a user turn', () => {
    const history = transcript(4);
    const out = buildApiMessages(history);
    expect(out[0].role).toBe('user');
  });

  it('summarises the older portion once past the message budget', () => {
    const history = transcript(80, 10);
    const out = buildApiMessages(history);
    // Far fewer than 80 — a summary plus the recent tail.
    expect(out.length).toBeLessThan(20);
    expect(out[0].role).toBe('user');
    expect(out[0].content).toContain('summarised');
    // The most recent message survives verbatim somewhere in the tail.
    expect(out[out.length - 1].content).toContain('#79');
  });

  it('coalesces consecutive same-role messages', () => {
    const history = [msg('user', 'a', 0), msg('user', 'b', 1), msg('assistant', 'c', 2)];
    const out = buildApiMessages(history);
    expect(out).toHaveLength(2);
    expect(out[0].role).toBe('user');
    expect(out[0].content).toContain('a');
    expect(out[0].content).toContain('b');
  });

  it('estimates tokens roughly by length', () => {
    expect(estimateTokens('x'.repeat(40))).toBe(10);
  });
});
