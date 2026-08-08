// Orchestrates one user turn end to end: persist the user message, call the
// model with the full system prompt + pruned transcript, log usage (§12),
// persist the assistant reply and any updated recipe candidate. The UI calls
// only this — every DB write here is immediate, so a crash mid-turn loses
// nothing (§4).
import type { DbClient } from '../db/DbClient';
import { getApiKey } from './apiKeyStore';
import { runBotTurn, BotApiError, type BotTurnResult } from './anthropicClient';
import { appendMessage, getMessages, setModelUsed, updateDraft } from './chatRepo';
import { buildApiMessages } from './contextWindow';
import { proposedToDraft, resolveDraftIngredients } from './proposedToDraft';
import { buildSystemPrompt } from './systemPrompt';
import { logUsage } from './usageRepo';
import { MODEL_IDS, type BotChat, type BotMessage, type ProposedRecipe } from './types';
import type { RecipeDraft } from '../recipes/recipeSave';

export interface TurnProposal {
  proposed: ProposedRecipe;
  draft: RecipeDraft;
  /** Lowercased display names auto-created this turn (§6 badge). */
  newIngredientNames: Set<string>;
}

export interface TurnResult {
  assistantMessage: BotMessage;
  /** The recipe candidate before this turn — the diff baseline for §9. */
  previousDraft: ProposedRecipe | null;
  /** The new candidate, mapped + ingredient-resolved, or null for a pure reply. */
  proposal: TurnProposal | null;
}

// A default confirmation for when the model calls the tool but returns no prose.
function fallbackText(proposed: ProposedRecipe | null): string {
  if (proposed) return "Here's the recipe — take a look and tell me what to change.";
  return '…';
}

// Append a user message and run a turn. If the API call fails the user message
// stays saved, so retryTurn() below can re-run from the same transcript without
// duplicating it (§10 retry).
export async function sendUserTurn(
  db: DbClient,
  chat: BotChat,
  userText: string,
  userName: string,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<TurnResult> {
  await appendMessage(db, chat.id, 'user', userText);
  return runTurn(db, chat, userName, options);
}

// Re-run the last turn from the current transcript (whose final message is the
// user turn that failed) — used by the retry-able error bubble (§10).
export async function retryTurn(
  db: DbClient,
  chat: BotChat,
  userName: string,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<TurnResult> {
  return runTurn(db, chat, userName, options);
}

async function runTurn(
  db: DbClient,
  chat: BotChat,
  userName: string,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<TurnResult> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new BotApiError('No Dishision Bot API key set. Add one in Settings.', false);

  const previousDraft = chat.draft;
  const system = buildSystemPrompt({
    userName,
    source: chat.source,
    settings: chat.settings,
    currentRecipe: previousDraft,
  });
  const history = await getMessages(db, chat.id);
  const messages = buildApiMessages(history);

  // On failure this throws with the user message left saved, so a retry (§10)
  // re-runs from the same transcript via retryTurn().
  const result: BotTurnResult = await runBotTurn({
    apiKey,
    model: MODEL_IDS[chat.settings.model],
    system,
    messages,
    fetchImpl: options.fetchImpl,
  });

  // Log usage regardless of whether a recipe came back — every call costs (§12).
  await logUsage(db, {
    chatId: chat.id,
    model: result.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  });
  await setModelUsed(db, chat.id, result.model);

  let proposal: TurnProposal | null = null;
  if (result.proposedRecipe) {
    const draft = proposedToDraft(result.proposedRecipe);
    const { ingredients, newIngredientNames } = await resolveDraftIngredients(db, draft.ingredients);
    proposal = { proposed: result.proposedRecipe, draft: { ...draft, ingredients }, newIngredientNames };
    await updateDraft(db, chat.id, result.proposedRecipe);
  }

  const assistantMessage = await appendMessage(
    db,
    chat.id,
    'assistant',
    result.assistantText || fallbackText(result.proposedRecipe),
  );

  return { assistantMessage, previousDraft, proposal };
}
