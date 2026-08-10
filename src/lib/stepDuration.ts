// Split/combine helpers for the recipe step editor's minutes + seconds inputs
// (batch-2 B1). The DB stores whole seconds (`durationSeconds`,
// `startOffsetSeconds`); the editor exposes them as a Mins field and a Seconds
// field. Pure so the combine rules (blank parts, seconds clamped to 0–59,
// both-blank ⇒ undefined) are unit-tested.

/** The minutes component of a seconds value, as an input string ('' when unset). */
export function minutesPart(totalSeconds: number | undefined | null): string {
  return totalSeconds != null ? String(Math.floor(totalSeconds / 60)) : '';
}

/** The seconds component (0–59) of a seconds value, as an input string. */
export function secondsPart(totalSeconds: number | undefined | null): string {
  return totalSeconds != null ? String(totalSeconds % 60) : '';
}

function parsePart(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

/** Combine a Mins string and a Seconds string into total seconds. Either blank
 *  counts as 0 for that part; both blank ⇒ undefined (no duration). Seconds are
 *  clamped to 0–59 (typing 90 becomes 59) rather than rolling into minutes. */
export function combineMinutesSeconds(minsStr: string, secsStr: string): number | undefined {
  const m = parsePart(minsStr);
  const sRaw = parsePart(secsStr);
  const s = sRaw == null ? null : Math.min(59, Math.max(0, sRaw));
  const mins = m == null ? null : Math.max(0, m);
  if (mins == null && s == null) return undefined;
  return (mins ?? 0) * 60 + (s ?? 0);
}
