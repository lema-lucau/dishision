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
