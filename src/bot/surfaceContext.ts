// §A2: scoped context fragments a surface can attach to a turn — the situational
// data (pantry, leftovers, a cook's feedback, the current step) that the shared
// session layer folds into the SCOPED CONTEXT block (§A1.2). Kept here so each
// surface's entry point stays thin.
import type { DbClient } from '../db/DbClient';
import { loadActiveLeftovers } from '../cooking/leftoverMutations';
import { loadPantry } from '../plan/pantryMutations';

// What's in the pantry right now, plus anything flagged running-low (§A2.2).
export async function buildPantryContextFragment(db: DbClient): Promise<string | null> {
  const pantry = await loadPantry(db);
  if (pantry.length === 0) return null;
  const names = pantry.map((p) => p.name).join(', ');
  const low = await db.getAllAsync<{ name: string }>(
    'SELECT ci.name FROM staple s JOIN canonical_ingredient ci ON ci.id = s.canonical_id WHERE s.running_low = 1 ORDER BY ci.name',
  );
  const lowLine = low.length ? ` Running low (don't lean on these): ${low.map((l) => l.name).join(', ')}.` : '';
  return `The user's pantry currently has: ${names}.${lowLine} Prefer a recipe that mostly uses what they already have.`;
}

// Active leftovers, nearest expiry first (§A2.2).
export async function buildLeftoverContextFragment(db: DbClient): Promise<string | null> {
  const leftovers = await loadActiveLeftovers(db);
  if (leftovers.length === 0) return null;
  const sorted = [...leftovers].sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  const lines = sorted.map(
    (l) => `${l.recipeName} (${l.servingsRemaining} serving${l.servingsRemaining === 1 ? '' : 's'}, use by ${l.expiresAt.slice(0, 10)})`,
  );
  return `The user has leftovers to use up, nearest expiry first: ${lines.join('; ')}. Suggest something that uses or complements them.`;
}

// §A2.2 quick-start chips shown on an empty new chat. Each fills the input with
// an editable starter message (never auto-sent) and attaches its context to that
// first turn.
export interface QuickStart {
  label: string;
  message: string;
  context: string | null;
}

// §A2.3 Cook Log → Refine: the scoped context (that cook's feedback) plus the
// opening user turn that makes the bot propose a concrete change rather than
// ask an open question.
export interface CookRefineSeed {
  recipeId: number;
  recipeName: string;
  contextFragment: string;
  autoMessage: string;
}

export async function buildCookRefineSeed(db: DbClient, cookLogId: number): Promise<CookRefineSeed | null> {
  const cook = await db.getFirstAsync<{
    recipe_id: number;
    name: string;
    base_servings: number;
    stars: number | null;
    notes: string | null;
    what_went_well: string | null;
    what_to_change: string | null;
    servings_made: number;
  }>(
    `SELECT cl.recipe_id, r.name, r.base_servings, cl.stars, cl.notes, cl.what_went_well, cl.what_to_change, cl.servings_made
       FROM cook_log cl JOIN recipe r ON r.id = cl.recipe_id WHERE cl.id = ?`,
    [cookLogId],
  );
  if (!cook) return null;

  const subs = await db.getAllAsync<{ original_text: string; replacement_text: string; verdict: string | null }>(
    'SELECT original_text, replacement_text, verdict FROM cook_log_substitution WHERE cook_log_id = ?',
    [cookLogId],
  );

  const lines: string[] = [`This chat was started from a specific cook of "${cook.name}". Here's how that cook went:`];
  lines.push(`- Rating: ${cook.stars != null ? `${cook.stars}/5` : 'not rated'}`);
  lines.push(`- Cooked ${cook.servings_made} serving${cook.servings_made === 1 ? '' : 's'} (recipe is written for ${cook.base_servings})`);
  if (cook.notes?.trim()) lines.push(`- Notes: ${cook.notes.trim()}`);
  if (cook.what_went_well?.trim()) lines.push(`- What went well: ${cook.what_went_well.trim()}`);
  if (cook.what_to_change?.trim()) lines.push(`- What to change: ${cook.what_to_change.trim()}`);
  if (subs.length) {
    const subText = subs.map((s) => `${s.original_text} → ${s.replacement_text}${s.verdict ? ` (${s.verdict})` : ''}`).join('; ');
    lines.push(`- Substitutions tried: ${subText}`);
  }
  lines.push(
    'Use this feedback to propose concrete, specific changes to the recipe (adjust a quantity, a time, an ingredient), not open questions. Acknowledge the feedback briefly, then call propose_recipe with the updated recipe.',
  );

  return {
    recipeId: cook.recipe_id,
    recipeName: cook.name,
    contextFragment: lines.join('\n'),
    autoMessage: 'I just cooked this — the feedback above is how it went. Based on that, what would you change about the recipe?',
  };
}

export async function buildQuickStarts(db: DbClient): Promise<QuickStart[]> {
  const [pantry, leftovers] = await Promise.all([buildPantryContextFragment(db), buildLeftoverContextFragment(db)]);
  return [
    { label: 'Use up my pantry', message: 'Make me something using what I have in the pantry.', context: pantry },
    { label: 'Something quick', message: 'Make me something quick — as little total time as possible.', context: null },
    { label: 'Use up leftovers', message: 'Help me use up my leftovers.', context: leftovers },
    { label: 'Surprise me', message: 'Surprise me with something good, respecting my usual preferences.', context: null },
  ];
}
