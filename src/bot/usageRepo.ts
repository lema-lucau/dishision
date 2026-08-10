// §12: usage logging + the aggregations that power the Stats "Dishision Bot"
// section. One bot_usage_log row per API call, with the estimated USD cost
// computed and stored at log time (pricing.ts) so slices by week/model/all-time
// never recompute from raw tokens. No blocking logic hangs off this — it's
// visibility only.
import type { DbClient } from '../db/DbClient';
import { uuidv4 } from '../utils/uuid';
import { bucketize, windowStartKey, type Bucket } from '../profile/bucketize';
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

export interface ModelUsage extends UsageTotals {
  model: BotModelKey;
}

export interface SurfaceUsage extends UsageTotals {
  /** The bot_usage_log.surface tag, or 'other' for pre-§A1 untagged rows. */
  surface: string;
}

export interface BotUsageStats {
  overall: UsageTotals;
  /** Adaptive-granularity cost series over the window (§F1.4). */
  buckets: Bucket[];
  byModel: ModelUsage[];
  bySurface: SurfaceUsage[];
}

export interface LoadBotUsageOptions {
  windowDays?: number | null;
  now?: Date;
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

export async function loadBotUsageStats(db: DbClient, options: LoadBotUsageOptions = {}): Promise<BotUsageStats> {
  // Distinguish an explicit null (all time) from an omitted option (default 30).
  const windowDays = options.windowDays === undefined ? 30 : options.windowDays;
  const now = options.now ?? new Date();
  const rows = await db.getAllAsync<UsageRow>(
    'SELECT model, surface, input_tokens, output_tokens, estimated_cost, created_at FROM bot_usage_log ORDER BY created_at ASC',
  );

  // Every figure reflects the selected window (§F1.4).
  const startKey = windowStartKey(windowDays, now); // null = all time
  const windowed = rows.filter((r) => startKey == null || r.created_at.slice(0, 10) >= startKey);

  const overall: UsageTotals = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
  const byModel = new Map<BotModelKey, ModelUsage>();
  const bySurface = new Map<string, SurfaceUsage>();

  for (const r of windowed) {
    overall.calls += 1;
    overall.inputTokens += r.input_tokens;
    overall.outputTokens += r.output_tokens;
    overall.costUsd += r.estimated_cost;

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

  const buckets = bucketize({
    items: windowed,
    windowDays,
    now,
    dateOf: (r) => r.created_at,
    valueOf: (r) => r.estimated_cost,
    aggregate: 'sum',
  });

  return {
    overall,
    buckets,
    byModel: [...byModel.values()].sort((a, b) => b.costUsd - a.costUsd),
    bySurface: [...bySurface.values()].sort((a, b) => b.costUsd - a.costUsd),
  };
}
