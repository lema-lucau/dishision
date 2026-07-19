// §5.2 Home's plan card reads today's planned_meal row, if one exists.
// planned_meal itself only gets full CRUD in S11 — this is deliberately just
// the read Home needs so the card can appear the moment something lands in
// the table, whether that's S11's UI or a test fixture.
import type { DbClient } from '../db/DbClient';
import { localDateKey } from '../lib/formatDate';

export interface TodaysPlanEntry {
  plannedMealId: number;
  recipeId: number;
  slot: string;
  plannedServings: number;
}

// Dinner wins when more than one slot is planned for today — that's the
// meal the Home mockup's plan card shows.
const SLOT_PRIORITY = ['dinner', 'lunch', 'breakfast', 'other'];

export async function loadTodaysPlan(db: DbClient, now: number = Date.now()): Promise<TodaysPlanEntry | null> {
  const rows = await db.getAllAsync<{ id: number; recipe_id: number; slot: string; planned_servings: number }>(
    'SELECT id, recipe_id, slot, planned_servings FROM planned_meal WHERE planned_date = ?',
    [localDateKey(now)],
  );
  if (rows.length === 0) return null;

  const sorted = [...rows].sort((a, b) => SLOT_PRIORITY.indexOf(a.slot) - SLOT_PRIORITY.indexOf(b.slot));
  const row = sorted[0];
  return { plannedMealId: row.id, recipeId: row.recipe_id, slot: row.slot, plannedServings: row.planned_servings };
}
