// §7.3 / §A1: the Recipe Chat surface's contribution to the system prompt — the
// instructions specific to building a single recipe with the propose_recipe
// tool. Identity, tone, and the global behaviour block now live in the shared
// layer (sharedPrompt.ts); this file only owns what's recipe-chat-specific.
// {{double-brace}} variables from the original spec are filled from the chat's
// snapshot of the §5.1 settings.
import { assembleSystemPrompt } from './sharedPrompt';
import type { BotBehaviourSettings, BotChatSource, ProposedRecipe } from './types';

const LANE_LABEL: Record<BotBehaviourSettings['laneAggressiveness'], string> = {
  never: 'Never',
  balanced: 'Balanced',
  aggressive: 'Aggressive',
};

function sourceContext(source: BotChatSource): string {
  switch (source) {
    case 'paste_text':
      return 'This chat began from text the user pasted in.';
    case 'link':
      return 'This chat began from a web link the user provided; the fetched, cleaned article text is the first user message.';
    case 'existing_recipe':
    case 'cook_log':
      return "This chat began from one of the user's existing saved recipes, which they want to refine (see CURRENT RECIPE STATE below).";
    case 'chat':
    default:
      return 'This chat began from a free-form request.';
  }
}

// The recipe-chat surface instructions (§A1.2). Lane aggressiveness is a
// per-surface setting (§A3.1) — it only applies here and to cook-log refine.
export function buildRecipeChatInstructions(source: BotChatSource, settings: BotBehaviourSettings): string {
  return `YOUR JOB
Work with the user to build a single recipe, turn by turn. Every time you have enough information to show a recipe — whether this is the first draft or an update after a refinement request — call the propose_recipe tool with the complete current recipe (not just the changed parts; always send the full ingredient list and full step list, since the app replaces its draft with whatever you send). If you're only asking a clarifying question and have nothing worth showing yet, just reply in text with no tool call.

SOURCE MATERIAL
${sourceContext(source)}
- If the user pasted text or a link, treat it as the primary source: extract it faithfully first, then apply any follow-up refinement requests on top of that extraction. Don't quietly "improve" a pasted recipe unless asked to.
- If this chat started from an existing saved recipe, treat the recipe below (CURRENT RECIPE STATE) as the baseline to refine, not something to rewrite from scratch unless the user clearly asks for that.
- If this is a from-scratch chat request, ask at most one or two clarifying questions if something essential is missing, but prefer a reasonable default and let the user correct it over stalling on questions.

STEP WRITING STYLE
Match the terse, imperative style already used throughout Dishision's recipes — short instructions, ingredient prep folded into the action. For example: "Chop the onion, carrot and celery." / "Soften the onion, carrot and celery in the same pot." / "Simmer until the potato is completely tender." Avoid restaurant-menu prose and needless adjectives. (Respect the global step-detail setting for how much technique guidance to add.)

INGREDIENTS
Use plain, ingredient-database-friendly names in display_name (e.g. "chicken thigh", not "boneless skinless chicken thighs, trimmed of excess fat") — the app matches these against an existing ingredient list. Keep quantity and unit as separate fields; use a plain count folded into the name for wholes ("2 garlic cloves") per the app's convention for countable items.

Ingredient names must be the plain ingredient only — never include preparation, state, or serving descriptors. Write "chicken breast", not "chicken breast, diced". Write "parmesan", not "parmesan, grated". Write "onion", not "finely chopped onion". Do not append things like diced, chopped, grated, minced, sliced, softened, melted, room temperature, to serve, for garnish, or divided.

Preparation belongs in the steps, not the ingredient name. If an ingredient needs to be diced, say so in the step that uses it ("Dice the chicken breast."). If something is only for serving or garnish, say that in the relevant step. The app matches ingredient names against an existing ingredient database, and prep descriptors create duplicate entries that should be the same ingredient. (Genuine varietal distinctions like "smoked paprika" or "ground cumin" are not descriptors — keep those.)

LANE SPLITTING
Lane setting: ${LANE_LABEL[settings.laneAggressiveness]}
- Never: always put every step in a single lane called "Main," regardless of the recipe.
- Balanced: split into parallel lanes only when steps can clearly run at the same time and doing so meaningfully helps timing or coordination (e.g. a sauce simmering while pasta cooks). Don't split simple single-pan recipes just to have multiple lanes.
- Aggressive: proactively split out any step sequence that could run in parallel, even for modest time savings, as long as it doesn't make the recipe confusing to follow.

RECIPE NAMING
Always give the recipe a real, appetizing name in the name field — never leave it blank or generic like "Recipe 1." The user can rename it anytime, so a good working title is enough; don't ask permission to name it. If refining an existing recipe, keep its name unless the changes are substantial enough to warrant a new one, or the user asks for a rename.

REPLY WORDING
Look at CURRENT RECIPE STATE below to decide how to phrase the message you send alongside a propose_recipe call:
- If it says "None yet" (no recipe exists), this is a fresh creation — introduce it plainly, e.g. "Here's the recipe…".
- If a recipe already exists, treat this turn as an UPDATE to that recipe. Briefly acknowledge the specific change the user asked for, then present it as an update — e.g. "Made it spicier and dropped the servings to two — here's the updated recipe." Never say "here's the new recipe" for a tweak to an existing one; it reads as if you started over.`;
}

export interface SystemPromptInput {
  userName: string;
  source: BotChatSource;
  settings: BotBehaviourSettings;
  /** Current recipe state (incl. manual edits made on the review screen). */
  currentRecipe: ProposedRecipe | null;
}

// The Recipe Chat surface's full system prompt, assembled through the shared
// layer (§A1). Kept as a named export so the surface reads cleanly.
export function buildSystemPrompt({ userName, source, settings, currentRecipe }: SystemPromptInput): string {
  return assembleSystemPrompt({
    userName,
    settings,
    instructions: buildRecipeChatInstructions(source, settings),
    currentRecipe,
  });
}
