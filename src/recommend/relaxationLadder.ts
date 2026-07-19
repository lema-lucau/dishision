// §6.3 relaxation ladder: window → ⌈window/2⌉ → ⌈window/4⌉ → no recency
// filter. Exactly three shrinking steps plus "off" (represented as 0, which
// applyHardFilters already treats as "recency filter disabled") — not a
// generic halving loop, per the spec's own worked examples:
//   default 5  → 5 → 3 → 2 → off
//   user-set 14 → 14 → 7 → 4 → off

export function relaxationLadder(startWindowDays: number): number[] {
  if (startWindowDays <= 0) return [0];
  return [startWindowDays, Math.ceil(startWindowDays / 2), Math.ceil(startWindowDays / 4), 0];
}

// §6.3: "Each relaxation step is labelled honestly in the UI." One label
// covers every relaxed step — the point is to say recency was loosened, not
// to itemise by how much.
export const RELAXATION_LABEL = "You've had these recently, but the cupboard's bare.";
