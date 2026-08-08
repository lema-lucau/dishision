// §12 cost calculation. Rates are per-MTok from Anthropic's published pricing
// (current as of Aug 2026 — re-check before shipping and after the Sonnet 5
// introductory period ends). Cost is computed once, at log time, and stored on
// the bot_usage_log row so the Stats view can slice by week/model/all-time
// without recomputing from raw tokens.
import { MODEL_IDS, type BotModelKey } from './types';

export interface Rate {
  /** USD per million input tokens. */
  input: number;
  /** USD per million output tokens. */
  output: number;
}

// Sonnet 5 has an introductory rate through Aug 31 2026, then a standard rate
// from Sep 1 2026. The boundary is expressed as a UTC instant so the switch is
// deterministic regardless of device timezone.
const SONNET_STANDARD_FROM = Date.parse('2026-09-01T00:00:00Z');

const HAIKU_RATE: Rate = { input: 1, output: 5 };
const SONNET_INTRO_RATE: Rate = { input: 2, output: 10 };
const SONNET_STANDARD_RATE: Rate = { input: 3, output: 15 };

// Conservative flat USD→EUR approximation for the "roughly what has this cost
// me" figure (§12) — deliberately not a live FX rate, and rounded so the EUR
// estimate never understates the USD amount actually billed.
export const USD_TO_EUR = 0.95;

// Resolve the rate for a model at a given instant. Accepts either the internal
// model key ('haiku'/'sonnet') or a concrete Anthropic model id string, so a
// usage row logged with the raw id from the API response still prices
// correctly.
export function rateFor(model: string, at: Date = new Date()): Rate {
  const key = normalizeModel(model);
  if (key === 'haiku') return HAIKU_RATE;
  // sonnet
  return at.getTime() >= SONNET_STANDARD_FROM ? SONNET_STANDARD_RATE : SONNET_INTRO_RATE;
}

// Map anything we might have stored — 'haiku', 'sonnet', or the full model id —
// onto a model key. Unknown ids fall back to Haiku pricing (the cheaper
// default) rather than throwing, so an old/renamed id never breaks Stats.
export function normalizeModel(model: string): BotModelKey {
  if (model === 'haiku' || model === MODEL_IDS.haiku) return 'haiku';
  if (model === 'sonnet' || model === MODEL_IDS.sonnet) return 'sonnet';
  if (model.includes('sonnet')) return 'sonnet';
  return 'haiku';
}

// estimated_cost = input_tokens × input_rate + output_tokens × output_rate.
export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  at: Date = new Date(),
): number {
  const rate = rateFor(model, at);
  return (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output;
}

export function usdToEur(usd: number): number {
  return usd * USD_TO_EUR;
}
