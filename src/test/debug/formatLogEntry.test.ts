import { describe, expect, it } from 'vitest';
import { formatLogEntries, formatLogEntry } from '../../debug/formatLogEntry';
import type { LogEntry } from '../../debug/types';

const base: LogEntry = {
  id: 1,
  ts: '2026-07-16T00:47:55.000Z',
  level: 'warn',
  category: 'pantry',
  message: 'Shortfall: chicken 300/400g',
};

describe('formatLogEntry', () => {
  it('serialises an entry as a single JSON object', () => {
    expect(formatLogEntry(base)).toBe(JSON.stringify(base));
    expect(JSON.parse(formatLogEntry(base))).toEqual(base);
  });

  it('includes data in the serialised object when present', () => {
    const entry = { ...base, data: { needed: 400, have: 300 } };
    expect(JSON.parse(formatLogEntry(entry))).toEqual(entry);
  });

  it('joins multiple entries as newline-delimited JSON (NDJSON)', () => {
    const entries = [base, { ...base, id: 2, message: 'second' }];
    const lines = formatLogEntries(entries).split('\n');
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => JSON.parse(l))).toEqual(entries);
  });
});
