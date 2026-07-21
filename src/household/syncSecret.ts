// §7.5: "sync_secret (32 random bytes, hex, minted by the QR-displaying
// phone at pairing)". Needs real entropy — uuid.ts's Math.random-based
// generator is explicitly not good enough for this (see its own comment).
// Native-only (expo-crypto), split out so nothing else in src/household
// needs a native module just to be unit-testable.
import * as Crypto from 'expo-crypto';

export async function mintSyncSecret(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
