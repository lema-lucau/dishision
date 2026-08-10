// §A2.5 Weekly Planning: gathers the situational context the planner needs — the
// saved-recipe catalogue (so the bot can reference recipes by id), what's already
// planned, what's been cooked recently, the pantry, and leftovers — and phrases
// the opening request. Standing cooking preferences arrive via the shared global
// block (sharedPrompt), so they're not repeated here.
import type { DbClient } from '../db/DbClient';
import { loadPlannedRange } from '../plan/loadPlannedRange';
import { loadEnrichedRecipes } from '../recipes/loadRecipes';
import { getWeeklyPlanningSettings } from './botSettings';
import { buildLeftoverContextFragment, buildPantryContextFragment } from './surfaceContext';
import type { PreferExisting } from './types';

export interface PlanningContext {
  /** The target days (YYYY-MM-DD), one per horizon day from the week start. */
  dates: string[];
  contextFragment: string;
  autoMessage: string;
  instructions: string;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function durLabel(bucket: string): string {
  if (bucket === 'under20') return 'under 20 min';
  if (bucket === '20to40') return '20–40 min';
  return 'over 40 min';
}

function preferExistingLine(pref: PreferExisting): string {
  switch (pref) {
    case 'strongly':
      return 'Strongly prefer existing saved recipes; only propose a new one where nothing saved fits at all.';
    case 'balanced':
      return 'Balance existing saved recipes with the occasional new idea where it clearly fits better.';
    case 'open':
      return 'Happy to suggest new recipes freely alongside existing ones.';
  }
}

export async function buildPlanningContext(db: DbClient, weekStartIso: string): Promise<PlanningContext> {
  const settings = await getWeeklyPlanningSettings(db);
  const horizon = Number(settings.horizon);
  const dates = Array.from({ length: horizon }, (_, i) => addDays(weekStartIso, i));
  const weekEnd = dates[dates.length - 1];

  const recipes = await loadEnrichedRecipes(db);
  const planned = await loadPlannedRange(db, weekStartIso, weekEnd);
  const [pantry, leftovers] = await Promise.all([buildPantryContextFragment(db), buildLeftoverContextFragment(db)]);
  const recent = await db.getAllAsync<{ name: string }>(
    `SELECT r.name FROM cook_log cl JOIN recipe r ON r.id = cl.recipe_id
      WHERE cl.cooked_at >= ? GROUP BY cl.recipe_id ORDER BY MAX(cl.cooked_at) DESC`,
    [`${addDays(weekStartIso, -14)}T00:00:00.000Z`],
  );

  const catalog = recipes
    .map(
      (r) =>
        `#${r.id} ${r.name}${r.avgRating != null ? ` (★${r.avgRating.toFixed(1)})` : ''} [${durLabel(r.durationBucket)}]`,
    )
    .join('\n');

  const lines: string[] = [];
  lines.push(`Plan dinners across these days: ${dates.join(', ')}.`);
  lines.push('');
  lines.push(
    'HOUSEHOLD: cooking for two people. Each cook typically yields ~2–4 servings of leftovers — enough to cover lunch and/or dinner for both on at least one following day. So do NOT schedule a fresh cook every day: schedule fewer cooks with leftover days in between, and lean on existing leftovers first before planning a new cook.',
  );
  lines.push('');
  lines.push('SAVED RECIPES — reference these by id in existing_recipe_id whenever one fits:');
  lines.push(catalog || '(no recipes saved yet)');
  if (planned.length) {
    lines.push('');
    lines.push('Already planned this week (leave these unless asked to change them):');
    lines.push(planned.map((p) => `${p.plannedDate}: ${p.recipeName}`).join('\n'));
  }
  if (recent.length) {
    lines.push('');
    lines.push(`Recently cooked (avoid repeating too soon): ${recent.map((r) => r.name).join(', ')}.`);
  }
  if (pantry) {
    lines.push('');
    lines.push(pantry);
  }
  if (leftovers) {
    lines.push('');
    lines.push(leftovers);
  }

  const instructions = `You are helping plan the week's dinners for a two-person household. Call propose_meal_plan with one entry per day, each with a one-line reason. ${preferExistingLine(
    settings.preferExisting,
  )} Reference existing recipes by their id (existing_recipe_id); only use new_recipe_name when nothing saved suits.

Space the cooks out — each cook makes enough for leftovers, so plan a mix of COOK days and LEFTOVER days rather than a cook every single day. For a leftover day, set is_leftover: true and point existing_recipe_id at the recipe those leftovers come from (the cook earlier in the week, or an existing leftover). A leftover day needs no new_recipe_name and creates no new cook. Use existing leftovers first before planning a new cook.

Don't re-plan a day that's already planned unless asked. If the user just chats, reply briefly and re-propose when they've given direction.`;

  return {
    dates,
    contextFragment: lines.join('\n'),
    autoMessage: 'Help me plan this week. Propose dinners for these days.',
    instructions,
  };
}
