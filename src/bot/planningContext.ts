// §A2.5 Weekly Planning: gathers the situational context the planner needs — the
// saved-recipe catalogue (so the bot can reference recipes by id), what's already
// planned, what's been cooked recently, the pantry, and leftovers — and phrases
// the opening request. Standing cooking preferences arrive via the shared global
// block (sharedPrompt), so they're not repeated here.
import type { DbClient } from '../db/DbClient';
import { loadPlannedRange } from '../plan/loadPlannedRange';
import { loadEnrichedRecipes } from '../recipes/loadRecipes';
import { getHouseholdSize } from '../settings/getSetting';
import { getWeeklyPlanningSettings } from './botSettings';
import { buildLeftoverContextFragment, buildPantryContextFragment } from './surfaceContext';
import type { PreferExisting } from './types';

export interface PlanningContext {
  /** The target days (YYYY-MM-DD), one per horizon day from the week start. */
  dates: string[];
  /** People a batch is divided across — drives the leftover layout (§E). */
  householdSize: number;
  contextFragment: string;
  autoMessage: string;
  instructions: string;
}

function peopleLabel(n: number): string {
  return n === 1 ? 'one person' : `${n} people`;
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
  const householdSize = await getHouseholdSize(db);
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
  lines.push(`Plan the dinners to cook across the next ${dates.length} days (starting ${dates[0]}).`);
  lines.push('');
  lines.push(
    `HOUSEHOLD: cooking for ${peopleLabel(householdSize)}. Return an ORDERED list of fresh dinners to cook — the app schedules leftover days between them automatically based on each recipe's batch size, so do NOT mark leftover days or assign dates yourself. Just choose the cooks, in the order they should happen, and space variety across the list. Lean on existing leftovers/pantry first.`,
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

  const instructions = `You are helping plan dinners for a ${peopleLabel(householdSize)} household across the next ${dates.length} days. Call propose_meal_plan with an ORDERED list of fresh dinners to cook (the "cooks" array), each with a one-line reason. ${preferExistingLine(
    settings.preferExisting,
  )} Reference existing recipes by their id (existing_recipe_id); only use new_recipe_name when nothing saved suits.

Do NOT assign dates and do NOT mark leftover days — the app schedules the leftover days between your cooks automatically from each recipe's batch size. Just pick the cooks in the order they should happen, spacing variety across the list, and provide enough to fill the span in the worst case (up to one per day); the app stops early once coverage is reached. Lean on existing leftovers and the pantry first.

Don't re-propose meals already planned this week unless asked. If the user just chats, reply briefly and re-propose when they've given direction.`;

  return {
    dates,
    householdSize,
    contextFragment: lines.join('\n'),
    autoMessage: `Help me plan the next ${dates.length} days of dinners. Give me an ordered list of cooks.`,
    instructions,
  };
}
