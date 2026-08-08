import { describe, expect, it } from 'vitest';
import { parseResponse } from '../../bot/anthropicClient';

describe('parseResponse (§7.1)', () => {
  it('extracts text and a propose_recipe tool call', () => {
    const result = parseResponse(
      {
        model: 'claude-haiku-4-5-20251001',
        content: [
          { type: 'text', text: "Here's a quick one." },
          { type: 'tool_use', name: 'propose_recipe', input: { name: 'Toast', ingredients: [], lanes: [] } },
        ],
        usage: { input_tokens: 120, output_tokens: 45 },
      },
      'haiku',
    );
    expect(result.assistantText).toBe("Here's a quick one.");
    expect(result.proposedRecipe?.name).toBe('Toast');
    expect(result.toolUse).toHaveLength(1);
    expect(result.toolUse[0].name).toBe('propose_recipe');
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 45 });
    expect(result.model).toBe('claude-haiku-4-5-20251001');
  });

  it('handles a pure clarifying reply with no tool call', () => {
    const result = parseResponse(
      { content: [{ type: 'text', text: 'How many servings?' }], usage: { input_tokens: 10, output_tokens: 5 } },
      'haiku',
    );
    expect(result.assistantText).toBe('How many servings?');
    expect(result.proposedRecipe).toBeNull();
  });

  it('ignores unrelated tool calls and missing usage', () => {
    const result = parseResponse({ content: [{ type: 'tool_use', name: 'other', input: {} }] }, 'sonnet');
    expect(result.proposedRecipe).toBeNull();
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
    expect(result.model).toBe('sonnet');
  });
});
