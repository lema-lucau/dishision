// §5: the Anthropic API key. Stored in Expo SecureStore (device keychain /
// Android keystore), NEVER in the `setting` table, NEVER in a backup export,
// and NEVER in the debug log — the key is the one secret that keeps a shared
// APK safe to hand around (§5, §12). It is also never bundled with the app.
//
// SecureStore is a native module; it's loaded lazily and guarded so that a
// JS-only environment (tests, web) degrades to "no key" rather than crashing.
import { logger } from '../debug/logStore';

const KEY_STORE_NAME = 'dishision_bot_api_key';

type SecureStoreModule = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

let cached: SecureStoreModule | null | undefined;

function loadSecureStore(): SecureStoreModule | null {
  if (cached !== undefined) return cached;
  try {
    // Lazy require: keeps pure-logic tests (which never touch the key) from
    // needing the native module present.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-secure-store') as SecureStoreModule;
    cached = mod;
  } catch {
    cached = null;
  }
  return cached;
}

export function isSecureStoreAvailable(): boolean {
  return loadSecureStore() != null;
}

export async function getApiKey(): Promise<string | null> {
  const store = loadSecureStore();
  if (!store) return null;
  try {
    return await store.getItemAsync(KEY_STORE_NAME);
  } catch (error) {
    logger.error('ui', 'Dishision Bot: failed to read API key', { error: String(error) });
    return null;
  }
}

export async function hasApiKey(): Promise<boolean> {
  return (await getApiKey())?.trim() ? true : false;
}

export async function setApiKey(key: string): Promise<void> {
  const store = loadSecureStore();
  if (!store) throw new Error('Secure storage is unavailable on this device.');
  // Deliberately no key material in the log — only that a write happened.
  await store.setItemAsync(KEY_STORE_NAME, key.trim());
  logger.info('ui', 'Dishision Bot: API key updated');
}

export async function clearApiKey(): Promise<void> {
  const store = loadSecureStore();
  if (!store) return;
  await store.deleteItemAsync(KEY_STORE_NAME);
  logger.info('ui', 'Dishision Bot: API key cleared');
}
