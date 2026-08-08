// §12: usage logging + the aggregations that power the Stats "Dishision Bot"
// section. One bot_usage_log row per API call, with the estimated USD cost
// computed and stored at log time (pricing.ts) so slices by week/model/all-time
// never recompute from raw tokens. No blocking logic hangs off this — it's
// visibility only.
import type { DbClient } from '../db/DbClient';
import { uuidv4 } from '../utils/uuid';
import { estimateCostUsd, normalizeModel } from './pricing';
import type { BotModelKey } from './types';

export async function logUsage(
  db: DbClient,
  args: { chatId: string | null; model: string; inputTokens: number; outputTokens: number; surface?: string | null },
): Promise<void> {
  const cost = estimateCostUsd(args.model, args.inputTokens, args.outputTokens);
  await db.runAsync(
    'INSERT INTO bot_usage_log (id, chat_id, surface, model, input_tokens, output_tokens, estimated_cost) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [uuidv4(), args.chatId, args.surface ?? null, args.model, args.inputTokens, args.outputTokens, cost],
  );
}

export interface UsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface WeeklyUsage {
  weekStart: string; // YYYY-MM-DD Monday key
  costUsd: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

export interface ModelUsage extends UsageTotals {
  model: BotModelKey;
}

export interface SurfaceUsage extends UsageTotals {
  /** The bot_usage_log.surface tag, or 'other' for pre-§A1 untagged rows. */
  surface: string;
}

export interface BotUsageStats {
  overall: UsageTotals;
  weekly: WeeklyUsage[];
  byModel: ModelUsage[];
  bySurface: SurfaceUsage[];
}

interface UsageRow {
  model: string;
  surface: string | null;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
  created_at: string;
}

// Monday-anchored week key for a YYYY-MM-DD... datetime string, matching the
// weekly-bar-chart convention used elsewhere in Stats.
export function weekStartKey(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - day);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// Build a contiguous run of Monday week-keys from the first week with data to
// the current week, so the bar chart has no gaps for quiet weeks.
function fillWeeks(map: Map<string, WeeklyUsage>): WeeklyUsage[] {
  const keys = [...map.keys()].sort();
  if (keys.length === 0) return [];
  const start = new Date(`${keys[0]}T00:00:00`);
  const end = new Date(`${weekStartKey(new Date().toISOString())}T00:00:00`);
  const out: WeeklyUsage[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 7)) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${dd}`;
    out.push(map.get(key) ?? { weekStart: key, costUsd: 0, calls: 0, inputTokens: 0, outputTokens: 0 });
  }
  return out;
}

export async function loadBotUsageStats(db: DbClient): Promise<BotUsageStats> {
  const rows = await db.getAllAsync<UsageRow>(
    'SELECT model, surface, input_tokens, output_tokens, estimated_cost, created_at FROM bot_usage_log ORDER BY created_at ASC',
  );

  const overall: UsageTotals = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
  const weekly = new Map<string, WeeklyUsage>();
  const byModel = new Map<BotModelKey, ModelUsage>();
  const bySurface = new Map<string, SurfaceUsage>();

  for (const r of rows) {
    overall.calls += 1;
    overall.inputTokens += r.input_tokens;
    overall.outputTokens += r.output_tokens;
    overall.costUsd += r.estimated_cost;

    const wk = weekStartKey(r.created_at);
    const w = weekly.get(wk) ?? { weekStart: wk, costUsd: 0, calls: 0, inputTokens: 0, outputTokens: 0 };
    w.calls += 1;
    w.costUsd += r.estimated_cost;
    w.inputTokens += r.input_tokens;
    w.outputTokens += r.output_tokens;
    weekly.set(wk, w);

    const key = normalizeModel(r.model);
    const m = byModel.get(key) ?? { model: key, calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
    m.calls += 1;
    m.inputTokens += r.input_tokens;
    m.outputTokens += r.output_tokens;
    m.costUsd += r.estimated_cost;
    byModel.set(key, m);

    const surfaceKey = r.surface ?? 'other';
    const s = bySurface.get(surfaceKey) ?? { surface: surfaceKey, calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
    s.calls += 1;
    s.inputTokens += r.input_tokens;
    s.outputTokens += r.output_tokens;
    s.costUsd += r.estimated_cost;
    bySurface.set(surfaceKey, s);
  }

  return {
    overall,
    weekly: fillWeeks(weekly),
    byModel: [...byModel.values()].sort((a, b) => b.costUsd - a.costUsd),
    bySurface: [...bySurface.values()].sort((a, b) => b.costUsd - a.costUsd),
  };
}
