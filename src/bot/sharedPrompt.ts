// §A1: the shared Dishision Bot prompt layer. Bot identity, tone, and the global
// behaviour block live here once, so changing the bot's voice or a global rule
// is a one-line edit rather than a hunt across five surface prompts. Each surface
// contributes only its own instructions, a scoped context fragment, and its
// tools (§A1.2); this module assembles them in the fixed §A1.3 order:
//
//   [identity + tone] [global settings] [surface instructions]
//   [surface scoped context] [current recipe state, if any]
import type { BotBehaviourSettings } from './types';

const UNIT_LABEL: Record<BotBehaviourSettings['units'], string> = { metric: 'metric', imperial: 'imperial' };
const DETAIL_LABEL: Record<BotBehaviourSettings['stepDetail'], string> = { brief: 'Brief', detailed: 'Detailed' };

// Shared identity + tone. toneOverride lets a surface tighten the voice — e.g.
// the mid-cook quick-ask wants one or two sentences, not a paragraph.
export function buildIdentityBlock(userName: string, toneOverride?: string | null): string {
  const tone =
    toneOverride?.trim() ||
    "Keep your conversational replies short and practical — you're a cooking collaborator, not a chatbot performing enthusiasm. It's fine to ask a quick follow-up or note an assumption you made, but don't pad replies with unnecessary commentary.";
  return `You are Dishision Bot, a cooking assistant built into the Dishision app. You help ${userName} and Tara cook well — something they can actually make, not a generic internet recipe.

TONE
${tone} Never refer to yourself as an "AI" or "assistant model" — you're Dishision Bot.`;
}

// The global behaviour block — applies to every surface (§A3.1): units, default
// servings, step detail, standing cooking preferences.
export function buildGlobalSettingsBlock(settings: BotBehaviourSettings): string {
  const prefs = settings.cookingPreferences.trim() || 'none';
  return `GLOBAL PREFERENCES
- Write quantities in ${UNIT_LABEL[settings.units]}, regardless of what unit system any source material used.
- Assume ${settings.defaultServings} servings unless the user specifies otherwise.
- Step detail level: ${DETAIL_LABEL[settings.stepDetail]} — ${
    settings.stepDetail === 'brief'
      ? 'terse, imperative instructions; no filler; prep folded into the action.'
      : 'the same direct tone, with brief technique guidance where it genuinely helps.'
  }
- Standing preferences to always respect: ${prefs}`;
}

export function buildCurrentRecipeBlock(currentRecipe: unknown): string {
  const json = currentRecipe ? JSON.stringify(currentRecipe, null, 2) : 'None yet — this is a fresh recipe.';
  return `CURRENT RECIPE STATE
${json}
This is the recipe as it stands right now, including any manual edits made directly on the review screen (which may not be reflected anywhere earlier in this conversation). Treat it as the source of truth to build on, not your own last tool call.`;
}

export interface AssemblePromptParts {
  userName: string;
  settings: BotBehaviourSettings;
  toneOverride?: string | null;
  /** Surface-specific instructions (§A1.2). */
  instructions: string;
  /** Surface-specific scoped context (§A1.2), e.g. current step, cook feedback. */
  contextFragment?: string | null;
  /** The current recipe, when the surface has one. */
  currentRecipe?: unknown;
  /** Whether to append the CURRENT RECIPE STATE block. Defaults to true; pure
   * Q&A surfaces that fold the recipe into their context fragment set false. */
  includeCurrentRecipe?: boolean;
}

export function assembleSystemPrompt(parts: AssemblePromptParts): string {
  const sections = [
    buildIdentityBlock(parts.userName, parts.toneOverride),
    buildGlobalSettingsBlock(parts.settings),
    parts.instructions.trim(),
    parts.contextFragment?.trim() ? `SCOPED CONTEXT\n${parts.contextFragment.trim()}` : '',
    parts.includeCurrentRecipe === false ? '' : buildCurrentRecipeBlock(parts.currentRecipe ?? null),
  ];
  return sections.filter(Boolean).join('\n\n');
}
