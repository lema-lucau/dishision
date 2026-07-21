// §7.2 transport: deep link (2 KB), QR (1.2 KB, offered only when it fits),
// and the always-available .preppie file. Size guards are on the JSON
// payload itself, not the base64 blow-up — same convention for both rows
// in §7.2's table.
import { base64DecodeUtf8, base64EncodeUtf8, utf8ByteLength } from './base64';
import { parseSharePayload, serializeSharePayload, type SharePayload } from './payload';

export const DEEP_LINK_MAX_BYTES = 2048;
export const QR_MAX_BYTES = 1200;
export const DEEP_LINK_SCHEME = 'preppie://import';

export function payloadByteLength(payload: SharePayload): number {
  return utf8ByteLength(serializeSharePayload(payload));
}

export function isDeepLinkEligible(payload: SharePayload): boolean {
  return payloadByteLength(payload) < DEEP_LINK_MAX_BYTES;
}

export function isQrEligible(payload: SharePayload): boolean {
  return payloadByteLength(payload) < QR_MAX_BYTES;
}

export function buildDeepLinkUrl(payload: SharePayload): string {
  const encoded = base64EncodeUtf8(serializeSharePayload(payload));
  return `${DEEP_LINK_SCHEME}?d=${encoded}`;
}

export class DeepLinkParseError extends Error {}

// Accepts both a full preppie://import?d=... URL and a bare d= query value,
// since the QR/paste-a-link entry points hand this the same string either way.
export function parseDeepLinkUrl(url: string): SharePayload {
  const trimmed = url.trim();
  let encoded: string | null = null;
  if (trimmed.startsWith(DEEP_LINK_SCHEME)) {
    const queryIndex = trimmed.indexOf('?');
    if (queryIndex === -1) throw new DeepLinkParseError('Missing payload in deep link');
    const params = new URLSearchParams(trimmed.slice(queryIndex + 1));
    encoded = params.get('d');
  } else if (trimmed.startsWith('d=')) {
    encoded = trimmed.slice(2);
  } else {
    encoded = trimmed;
  }
  if (!encoded) throw new DeepLinkParseError('Missing payload in deep link');
  let json: string;
  try {
    json = base64DecodeUtf8(encoded);
  } catch {
    throw new DeepLinkParseError('Could not decode payload');
  }
  return parseSharePayload(json);
}

export const PREPPIE_FILE_EXTENSION = '.preppie';

export function suggestedFileName(payload: SharePayload): string {
  const slug = payload.recipe.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'recipe'}${PREPPIE_FILE_EXTENSION}`;
}
