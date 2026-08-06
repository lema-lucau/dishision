import { create } from 'zustand';
import type { LogCategory, LogEntry, LogLevel } from './types';

const RING_BUFFER_SIZE = 2000;

interface LogStore {
  entries: LogEntry[];
  nextId: number;
  log: (level: LogLevel, category: LogCategory, message: string, data?: unknown) => void;
  clear: () => void;
  /** Replace or append the buffer wholesale — used by the Debug screen's
   * Import, so a log file captured on another device can be inspected here. */
  setEntries: (entries: LogEntry[], mode: 'replace' | 'append') => void;
}

// In-memory ring buffer, per §12.1: always capturing, nothing persists,
// a full app restart starts fresh. Debug mode gates only screen visibility.
export const useLogStore = create<LogStore>((set) => ({
  entries: [],
  nextId: 1,
  log: (level, category, message, data) =>
    set((state) => {
      const entry: LogEntry = {
        id: state.nextId,
        ts: new Date().toISOString(),
        level,
        category,
        message,
        data,
      };
      const entries = [...state.entries, entry];
      if (entries.length > RING_BUFFER_SIZE) {
        entries.splice(0, entries.length - RING_BUFFER_SIZE);
      }
      return { entries, nextId: state.nextId + 1 };
    }),
  clear: () => set({ entries: [] }),
  setEntries: (incoming, mode) =>
    set((state) => {
      const base = mode === 'append' ? [...state.entries, ...incoming] : incoming.slice();
      const trimmed = base.length > RING_BUFFER_SIZE ? base.slice(base.length - RING_BUFFER_SIZE) : base;
      // Keep nextId ahead of anything imported so future logs never collide.
      const maxId = trimmed.reduce((m, e) => Math.max(m, e.id), 0);
      return { entries: trimmed, nextId: Math.max(state.nextId, maxId + 1) };
    }),
}));

function log(level: LogLevel, category: LogCategory, message: string, data?: unknown) {
  useLogStore.getState().log(level, category, message, data);
}

export const logger = {
  debug: (category: LogCategory, message: string, data?: unknown) =>
    log('debug', category, message, data),
  info: (category: LogCategory, message: string, data?: unknown) =>
    log('info', category, message, data),
  warn: (category: LogCategory, message: string, data?: unknown) =>
    log('warn', category, message, data),
  error: (category: LogCategory, message: string, data?: unknown) =>
    log('error', category, message, data),
};
