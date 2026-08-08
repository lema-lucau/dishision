// Orchestrates one user turn end to end: persist the user message, call the
// model with the full system prompt + pruned transcript, log usage (§12),
// persist the assistant reply and any updated recipe candidate. The UI calls
// only this — every DB write here is immediate, so a crash mid-turn loses
// nothing (§4).
import type { DbClient } from '../db/DbClient';
import { runSurfaceTurn, type BotSurface } from './botSession';
import { appendMessage, getMessages, setModelUsed, updateDraft } from './chatRepo';
import { buildApiMessages } from './contextWindow';
import { PROPOSE_RECIPE_TOOL } from './proposeRecipeTool';
import { proposedToDraft, resolveDraftIngredients } from './proposedToDraft';
import { buildRecipeChatInstructions } from './systemPrompt';
import { type BotChat, type BotMessage, type ProposedRecipe } from './types';
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
  options: { fetchImpl?: typeof fetch; contextFragment?: string | null } = {},
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
  options: { fetchImpl?: typeof fetch; contextFragment?: string | null } = {},
): Promise<TurnResult> {
  return runTurn(db, chat, userName, options);
}

async function runTurn(
  db: DbClient,
  chat: BotChat,
  userName: string,
  options: { fetchImpl?: typeof fetch; contextFragment?: string | null } = {},
): Promise<TurnResult> {
  const previousDraft = chat.draft;
  const history = await getMessages(db, chat.id);
  const messages = buildApiMessages(history);

  // Route the turn through the shared session layer (§A1): it owns the API key,
  // prompt assembly, the call, and usage logging (tagged 'recipe_chat'). This
  // surface contributes the recipe-chat instructions and the propose_recipe
  // tool. On failure it throws with the user message left saved, so a retry
  // (§10) re-runs from the same transcript via retryTurn().
  // A cook-log refine is the same recipe-building flow, but tagged as its own
  // surface for the Stats "by feature" view (§A1.4, §A2.3).
  const surface: BotSurface = chat.source === 'cook_log' ? 'cook_log_refine' : 'recipe_chat';
  const result = await runSurfaceTurn(db, {
    surface,
    userName,
    settings: chat.settings,
    instructions: buildRecipeChatInstructions(chat.source, chat.settings),
    contextFragment: options.contextFragment ?? null,
    currentRecipe: previousDraft,
    tools: [PROPOSE_RECIPE_TOOL],
    messages,
    chatId: chat.id,
    fetchImpl: options.fetchImpl,
  });
  await setModelUsed(db, chat.id, result.model);

  const recipeCall = result.toolUse.find((t) => t.name === 'propose_recipe');
  const proposedRecipe: ProposedRecipe | null =
    recipeCall && recipeCall.input && typeof recipeCall.input === 'object' ? (recipeCall.input as ProposedRecipe) : null;

  let proposal: TurnProposal | null = null;
  if (proposedRecipe) {
    const draft = proposedToDraft(proposedRecipe);
    const { ingredients, newIngredientNames } = await resolveDraftIngredients(db, draft.ingredients);
    proposal = { proposed: proposedRecipe, draft: { ...draft, ingredients }, newIngredientNames };
    await updateDraft(db, chat.id, proposedRecipe);
  }

  const assistantMessage = await appendMessage(
    db,
    chat.id,
    'assistant',
    result.assistantText || fallbackText(proposedRecipe),
  );

  return { assistantMessage, previousDraft, proposal };
}
