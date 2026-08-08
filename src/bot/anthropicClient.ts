// §7.1: one Anthropic Messages API call per user turn, using the model chosen
// in Settings. Structured output comes back through the propose_recipe tool
// (§7.2), not JSON-in-prose. Plain fetch, no SDK — the app already forbids
// extra dependencies, and the request is a single POST.
//
// This is the app's only outward internet call. It is entirely opt-in (needs a
// user-supplied key) and carries only the conversation, never any of the
// private cook-log/rating data the rest of the app guards.
import { logger } from '../debug/logStore';
import { PROPOSE_RECIPE_TOOL } from './proposeRecipeTool';
import type { BotUsage, ProposedRecipe } from './types';

const API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 4096;
const REQUEST_TIMEOUT_MS = 60_000;

export interface ApiMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** A raw tool call the model made — surface-agnostic (§A1). The session layer /
 * each surface interprets these by name (propose_recipe, propose_meal_plan, …). */
export interface BotToolUse {
  name: string;
  input: unknown;
}

export interface BotTurnResult {
  /** The conversational reply text (may be empty when the model only calls a tool). */
  assistantText: string;
  /** Every tool call the model made this turn, in order. */
  toolUse: BotToolUse[];
  /** Convenience for the recipe surfaces: the propose_recipe payload, or null. */
  proposedRecipe: ProposedRecipe | null;
  usage: BotUsage;
  /** The concrete model id the API reports it served. */
  model: string;
}

export class BotApiError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'BotApiError';
  }
}

interface RunBotTurnArgs {
  apiKey: string;
  model: string;
  system: string;
  messages: ApiMessage[];
  /** The tools available this turn. Defaults to just propose_recipe so existing
   * recipe-chat callers are unchanged; other surfaces pass their own (or []). */
  tools?: unknown[];
  /** Injected in tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export async function runBotTurn({ apiKey, model, system, messages, tools, fetchImpl }: RunBotTurnArgs): Promise<BotTurnResult> {
  const doFetch = fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await doFetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        system,
        tools: tools ?? [PROPOSE_RECIPE_TOOL],
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    const aborted = error instanceof Error && error.name === 'AbortError';
    logger.error('ui', 'Dishision Bot: request failed', { aborted, error: String(error) });
    throw new BotApiError(
      aborted ? 'Dishision Bot timed out. Try again.' : 'Couldn\'t reach Dishision Bot. Check your connection and try again.',
      true,
    );
  }
  clearTimeout(timeout);

  if (!response.ok) {
    const detail = await safeErrorMessage(response);
    // 429/5xx are worth retrying; 400/401/403 (bad key, bad request) are not.
    const retryable = response.status === 429 || response.status >= 500;
    logger.error('ui', 'Dishision Bot: API error', { status: response.status, detail });
    throw new BotApiError(friendlyStatus(response.status, detail), retryable);
  }

  const data = (await response.json()) as AnthropicResponse;
  return parseResponse(data, model);
}

interface AnthropicResponse {
  model?: string;
  content?: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; name: string; input: unknown }
    | { type: string; [k: string]: unknown }
  >;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export function parseResponse(data: AnthropicResponse, requestedModel: string): BotTurnResult {
  const blocks = Array.isArray(data.content) ? data.content : [];
  const textParts: string[] = [];
  const toolUse: BotToolUse[] = [];

  for (const block of blocks) {
    if (block.type === 'text' && typeof (block as { text?: unknown }).text === 'string') {
      textParts.push((block as { text: string }).text);
    } else if (block.type === 'tool_use' && typeof (block as { name?: unknown }).name === 'string') {
      toolUse.push({ name: (block as { name: string }).name, input: (block as { input?: unknown }).input });
    }
  }

  // Convenience for the recipe surfaces (§A1) — the propose_recipe payload.
  const recipeCall = toolUse.find((t) => t.name === 'propose_recipe');
  const proposedRecipe = recipeCall && recipeCall.input && typeof recipeCall.input === 'object' ? (recipeCall.input as ProposedRecipe) : null;

  return {
    assistantText: textParts.join('\n').trim(),
    toolUse,
    proposedRecipe,
    usage: {
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    },
    model: data.model ?? requestedModel,
  };
}

// §5 "Test key": one lightweight call to confirm the key works. Resolves on a
// 2xx, throws a BotApiError with a friendly message otherwise.
export async function testApiKey(apiKey: string, model: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const response = await fetchImpl(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
    body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'Hi' }] }),
  }).catch(() => {
    throw new BotApiError('Couldn\'t reach Dishision Bot. Check your connection.', true);
  });
  if (!response.ok) {
    const detail = await safeErrorMessage(response);
    throw new BotApiError(friendlyStatus(response.status, detail), response.status === 429 || response.status >= 500);
  }
}

async function safeErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? '';
  } catch {
    return '';
  }
}

function friendlyStatus(status: number, detail: string): string {
  if (status === 401 || status === 403) return 'Your Dishision Bot API key was rejected. Check it in Settings.';
  if (status === 429) return 'Dishision Bot is rate-limited right now. Wait a moment and try again.';
  if (status >= 500) return 'Dishision Bot is having a moment on the server side. Try again shortly.';
  return detail ? `Dishision Bot couldn't complete that: ${detail}` : 'Dishision Bot couldn\'t complete that request.';
}
