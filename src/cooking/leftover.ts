// §5.7 leftover model — the one sanctioned stored-state exception to §2.5.
// This module holds the pure "what should the row look like" logic; the
// actual read/write against `leftover` lives in leftoverMutations.ts.
const DEFAULT_LEFTOVER_DAYS = 3;

export interface LeftoverPlan {
  servingsRemaining: number;
  expiresAt: string;
}

// Only created when made > eaten. `cookedAt` is an ISO string; the default
// expiry is cookedAt + 3 days, editable thereafter by the caller/UI.
export function computeLeftoverPlan(
  servingsMade: number,
  servingsEaten: number,
  cookedAt: string,
  days = DEFAULT_LEFTOVER_DAYS,
): LeftoverPlan | null {
  const remaining = servingsMade - servingsEaten;
  if (remaining <= 0) return null;
  const expiresAt = new Date(new Date(cookedAt).getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  return { servingsRemaining: remaining, expiresAt };
}
