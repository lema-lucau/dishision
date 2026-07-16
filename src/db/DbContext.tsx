import { createContext, useContext, type ReactNode } from 'react';
import type { DbClient } from './DbClient';

const DbContext = createContext<DbClient | null>(null);

export function DbProvider({ db, children }: { db: DbClient; children: ReactNode }) {
  return <DbContext.Provider value={db}>{children}</DbContext.Provider>;
}

export function useDb(): DbClient {
  const db = useContext(DbContext);
  if (!db) {
    throw new Error('useDb() called outside <DbProvider>');
  }
  return db;
}
