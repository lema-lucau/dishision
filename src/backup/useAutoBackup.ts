// §10: "written on app background." Mounted once at the app root, mirrors
// useDeepLinkListener's shape.
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';

export function useAutoBackup(db: DbClient): void {
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      const wasActive = appState.current === 'active';
      appState.current = next;
      if (!wasActive || next === 'active') return;
      import('./autoBackup').then(({ writeAutoBackup }) =>
        writeAutoBackup(db).catch((error) => logger.warn('db', 'Auto-backup failed', { error: String(error) })),
      );
    });
    return () => subscription.remove();
  }, [db]);
}
