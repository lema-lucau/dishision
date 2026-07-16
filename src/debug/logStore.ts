import { create } from 'zustand';
import type { LogCategory, LogEntry, LogLevel } from './types';

const RING_BUFFER_SIZE = 2000;

interface LogStore {
  entries: LogEntry[];
  nextId: number;
  log: (level: LogLevel, category: LogCategory, message: string, data?: unknown) => void;
  clear: () => void;
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
