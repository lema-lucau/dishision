export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogCategory =
  | 'db'
  | 'engine'
  | 'sync'
  | 'cook'
  | 'pantry'
  | 'photo'
  | 'ui'
  | 'nav'
  | 'perf';

export interface LogEntry {
  id: number;
  ts: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: unknown;
}

export const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

export const LOG_CATEGORIES: LogCategory[] = [
  'db',
  'engine',
  'sync',
  'cook',
  'pantry',
  'photo',
  'ui',
  'nav',
  'perf',
];
