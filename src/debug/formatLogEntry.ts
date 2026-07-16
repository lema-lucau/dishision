import type { LogEntry } from './types';

// One JSON object per line (NDJSON) — machine-parseable, matches LogEntry exactly (§12.2).
export function formatLogEntry(entry: LogEntry): string {
  return JSON.stringify(entry);
}

export function formatLogEntries(entries: LogEntry[]): string {
  return entries.map(formatLogEntry).join('\n');
}
