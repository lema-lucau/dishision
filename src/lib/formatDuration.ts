// Hour-aware duration formatting for anything derived from duration_seconds
// (§4.5 time split bar, grid/list rows, recipe detail). Under an hour reads
// as plain minutes; an hour or more switches to "Xh Ym" (Xh when the
// remainder is zero) so a 90-minute stew doesn't read as "90 min".
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} mins`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

// Compact variant for tight spaces (grid cards): "45m" / "1h 5m".
export function formatDurationCompact(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

// Seconds-aware duration for *step* durations, which can carry sub-minute
// values (a 30-second rest). Under a minute reads as "30 sec"; whole minutes
// reuse the coarse minute/hour grammar; a seconds remainder is appended so a
// 90-second step reads "1 min 30 sec" (and "1h 5m 30s" once hours appear).
export function formatDurationPrecise(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total} sec`;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    let out = `${hours}h`;
    if (minutes > 0) out += ` ${minutes}m`;
    if (secs > 0) out += ` ${secs}s`;
    return out;
  }
  // Under an hour: "1 min", "1 min 30 sec".
  const minLabel = `${minutes} min`;
  return secs === 0 ? minLabel : `${minLabel} ${secs} sec`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// Live running-clock display for Cooking Mode: HH:MM:SS (drops the hours
// segment under an hour, MM:SS, so a quick 12-minute recipe doesn't read
// "00:12:04").
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours > 0 ? `${hours}:${pad2(minutes)}:${pad2(secs)}` : `${pad2(minutes)}:${pad2(secs)}`;
}
