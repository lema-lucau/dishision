// §A1: the shared Dishision Bot session layer. Every surface — recipe chat,
// cook-log refine, cooking quick-ask, weekly planning, the "I'm feeling"
// fallback — routes one user turn through here rather than hand-rolling its own
// prompt assembly and API call. The layer owns: API mechanics (key retrieval,
// the call, error shapes), prompt assembly via sharedPrompt.ts, and usage
// logging tagged with the surface (§A1.4). A surface contributes only its
// instructions, a scoped context fragment, its tools, and any tone override.
import type { DbClient } from '../db/DbClient';
import { getApiKey } from './apiKeyStore';
import { BotApiError, runBotTurn, type ApiMessage, type BotToolUse } from './anthropicClient';
import { assembleSystemPrompt } from './sharedPrompt';
import { MODEL_IDS, type BotBehaviourSettings } from './types';
import { logUsage } from './usageRepo';

// The surfaces, matching the bot_usage_log.surface tag (§A1.4).
export type BotSurface =
  | 'recipe_chat'
  | 'cook_log_refine'
  | 'cooking_quick_ask'
  | 'weekly_planning'
  | 'feeling_fallback'
  | 'theme_creator';

export interface SurfaceTurnRequest {
  surface: BotSurface;
  userName: string;
  settings: BotBehaviourSettings;
  /** Surface-specific instructions (§A1.2). */
  instructions: string;
  /** Surface-specific scoped context (§A1.2). */
  contextFragment?: string | null;
  currentRecipe?: unknown;
  includeCurrentRecipe?: boolean;
  toneOverride?: string | null;
  /** The tools available this turn — [] for a pure Q&A surface. */
  tools: unknown[];
  messages: ApiMessage[];
  /** For usage logging; may be null for a surface without a persisted chat. */
  chatId?: string | null;
  fetchImpl?: typeof fetch;
}

export interface SurfaceTurnResult {
  assistantText: string;
  toolUse: BotToolUse[];
  model: string;
}

export async function runSurfaceTurn(db: DbClient, req: SurfaceTurnRequest): Promise<SurfaceTurnResult> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new BotApiError('No Dishision Bot API key set. Add one in Settings.', false);

  const system = assembleSystemPrompt({
    userName: req.userName,
    settings: req.settings,
    toneOverride: req.toneOverride,
    instructions: req.instructions,
    contextFragment: req.contextFragment,
    currentRecipe: req.currentRecipe,
    includeCurrentRecipe: req.includeCurrentRecipe,
  });

  const result = await runBotTurn({
    apiKey,
    model: MODEL_IDS[req.settings.model],
    system,
    messages: req.messages,
    tools: req.tools,
    fetchImpl: req.fetchImpl,
  });

  // Every call from every surface is logged, tagged with which surface it came
  // from (§A1.4) — this is what the Stats view slices by.
  await logUsage(db, {
    chatId: req.chatId ?? null,
    surface: req.surface,
    model: result.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  });

  return { assistantText: result.assistantText, toolUse: result.toolUse, model: result.model };
}
