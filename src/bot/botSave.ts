// §11 save flow & origin tagging. From-scratch / paste / link drafts always
// create a new recipe. An existing-recipe refinement can either overwrite the
// original in place (same recipe.id, so its cook log, favourites, and household
// ratings — all keyed off that id — survive) or save as a brand-new recipe,
// leaving the original untouched. Either way the chat is linked to the result
// via saved_recipe_id and stays in history.
import type { DbClient } from '../db/DbClient';
import { createManualRecipe, updateManualRecipe, type RecipeDraft } from '../recipes/recipeSave';
import { setDishisionAssisted, setSavedRecipe } from './chatRepo';
import type { BotChat } from './types';

export type SaveMode = 'new' | 'overwrite';

const ASSISTED_LABEL = 'Dishision Assisted';

// §11: origin_url is written when the draft came from a link and the user
// marked it Dishision Assisted. RecipeDraft doesn't carry origin_url, so it's
// applied with a direct follow-up update.
async function applyOriginUrl(db: DbClient, recipeId: number, chat: BotChat, assisted: boolean): Promise<void> {
  if (assisted && chat.source === 'link' && chat.sourceUrl) {
    await db.runAsync('UPDATE recipe SET origin_url = ? WHERE id = ?', [chat.sourceUrl, recipeId]);
  }
}

export async function saveBotRecipe(
  db: DbClient,
  args: { draft: RecipeDraft; chat: BotChat; mode: SaveMode; dishisionAssisted: boolean },
): Promise<number> {
  const { chat, mode, dishisionAssisted } = args;
  // Only stamp the label when the user opted in; otherwise leave whatever the
  // draft already carries (e.g. an existing recipe's original origin).
  const draft: RecipeDraft = dishisionAssisted ? { ...args.draft, originLabel: ASSISTED_LABEL } : args.draft;

  let recipeId: number;
  if (mode === 'overwrite') {
    if (chat.originalRecipeId == null) throw new Error('Cannot overwrite: this chat has no original recipe.');
    await updateManualRecipe(db, chat.originalRecipeId, draft);
    recipeId = chat.originalRecipeId;
  } else {
    recipeId = await createManualRecipe(db, draft);
  }

  await applyOriginUrl(db, recipeId, chat, dishisionAssisted);
  await setDishisionAssisted(db, chat.id, dishisionAssisted);
  await setSavedRecipe(db, chat.id, recipeId);
  return recipeId;
}
