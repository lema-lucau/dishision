// Dishision Bot — shared types (recipe-creation-spec). Naming rule: internal
// identifiers may say "bot"/"AI"/"LLM" where it's genuinely clearer, but every
// user-facing string says "Dishision Bot" and never "AI".

// The two models offered in Settings (§5). Both support tool calling; the
// choice is purely a cost/quality tradeoff. Keys are the stable internal ids;
// the concrete Anthropic model id string lives in MODEL_IDS.
export type BotModelKey = 'haiku' | 'sonnet';

export const MODEL_IDS: Record<BotModelKey, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-5',
};

export const MODEL_LABELS: Record<BotModelKey, string> = {
  haiku: 'Haiku',
  sonnet: 'Sonnet',
};

export type LaneAggressiveness = 'never' | 'balanced' | 'aggressive';
export type StepDetailLevel = 'brief' | 'detailed';
export type PreferredUnits = 'metric' | 'imperial';

// §5.1 tweakable behaviour, plus the model. Snapshotted onto each chat at
// creation time so a later Settings change never retroactively alters how an
// in-flight conversation behaves.
export interface BotBehaviourSettings {
  model: BotModelKey;
  laneAggressiveness: LaneAggressiveness;
  stepDetail: StepDetailLevel;
  units: PreferredUnits;
  defaultServings: number;
  cookingPreferences: string;
}

export const DEFAULT_BOT_SETTINGS: BotBehaviourSettings = {
  model: 'haiku',
  laneAggressiveness: 'balanced',
  stepDetail: 'brief',
  units: 'metric',
  defaultServings: 2,
  cookingPreferences: '',
};

// ── propose_recipe tool output (§7.2) ──────────────────────────────────────
// The raw shape the model returns. Deliberately permissive: required fields
// are name/ingredients/lanes, everything else is optional and defaulted when
// mapped into a RecipeDraft (see proposedToDraft.ts).

export interface ProposedIngredient {
  display_name: string;
  quantity?: number;
  unit?: string;
  scalable?: boolean;
  optional?: boolean;
}

export interface ProposedStep {
  instruction: string;
  phase?: string;
  effort?: 'low' | 'medium' | 'high';
  important?: boolean;
  duration_seconds?: number | null;
}

export interface ProposedLane {
  name: string;
  steps: ProposedStep[];
}

export interface ProposedRecipe {
  name: string;
  description?: string;
  base_servings?: number;
  photo_emoji?: string;
  ingredients: ProposedIngredient[];
  lanes: ProposedLane[];
}

// ── chat / message rows (§4) ───────────────────────────────────────────────

// 'cook_log' is a refine chat started from a specific cook (§A2.3); it behaves
// like 'existing_recipe' (original_recipe_id set) but carries that cook's
// feedback and is traced back via origin_cook_log_id.
export type BotChatSource = 'chat' | 'paste_text' | 'link' | 'existing_recipe' | 'cook_log';
export type BotMessageRole = 'user' | 'assistant';

export interface BotChat {
  id: string;
  createdAt: string;
  updatedAt: string;
  source: BotChatSource;
  sourceUrl: string | null;
  originalRecipeId: number | null;
  /** Parsed ProposedRecipe, or null if the bot hasn't produced a candidate yet. */
  draft: ProposedRecipe | null;
  savedRecipeId: number | null;
  model: string | null;
  settings: BotBehaviourSettings;
  dishisionAssisted: boolean;
}

export interface BotMessage {
  id: string;
  chatId: string;
  role: BotMessageRole;
  content: string;
  createdAt: string;
}

// One turn's token accounting (§12).
export interface BotUsage {
  inputTokens: number;
  outputTokens: number;
}
