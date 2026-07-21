// Mounted once at the app root. Catches both transports that arrive from
// outside the app's own UI (§7.2): a preppie://import deep link, and a
// tapped .preppie file (delivered by the OS as a content:// or file:// URL
// via the same Linking channel once app.json registers the file
// association). Either way the result lands in importIntentStore for the
// Recipes tab to pick up — never written straight to the DB (§7.3).
import { useEffect } from 'react';
import { Linking } from 'react-native';
import { logger } from '../debug/logStore';
import { DEEP_LINK_SCHEME, parseDeepLinkUrl } from './transport';
import { useImportIntentStore } from './importIntentStore';

async function handleIncomingUrl(url: string): Promise<void> {
  try {
    if (url.startsWith(DEEP_LINK_SCHEME)) {
      const payload = parseDeepLinkUrl(url);
      useImportIntentStore.getState().setPending(payload);
      logger.info('db', 'Received recipe via deep link', { shareId: payload.share_id });
      return;
    }
    if (/\.preppie($|\?)/.test(url) || url.startsWith('content://') || url.startsWith('file://')) {
      const { readPreppieFile } = await import('./preppieFile');
      const payload = await readPreppieFile(url);
      useImportIntentStore.getState().setPending(payload);
      logger.info('db', 'Received recipe via .preppie file', { shareId: payload.share_id, url });
    }
  } catch (error) {
    logger.warn('db', 'Failed to parse incoming shared recipe', { url, error: String(error) });
  }
}

export function useDeepLinkListener(): void {
  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url) handleIncomingUrl(url);
    });
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleIncomingUrl(url);
    });
    return () => subscription.remove();
  }, []);
}
