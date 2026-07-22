// Share transport: a quick link (always available — it's just text a
// messaging app can carry at any length), a QR code (available whenever the
// encoded URL fits a QR symbol at all — the most convenient route, so it's
// offered right up to the format's hard capacity), and the always-available
// .dishision file (the only route that can carry a photo).
import { base64DecodeUtf8, base64EncodeUtf8, utf8ByteLength } from './base64';
import { parseSharePayload, serializeSharePayload, type SharePayload } from './payload';

// A QR symbol at version 40, byte mode, error-correction level L holds 2953
// bytes — the hard ceiling above which no QR code can be produced at all. We
// encode the deep-link URL (ASCII), so its character length is its byte
// length. Below this a code always exists; we only warn about scan difficulty.
export const QR_URL_MAX_CHARS = 2953;
// Above this the symbol is dense enough that a phone camera may struggle —
// still valid, but worth a heads-up to the user.
export const QR_URL_DENSE_CHARS = 1000;
export const DEEP_LINK_SCHEME = 'dishision://import';

export function payloadByteLength(payload: SharePayload): number {
  return utf8ByteLength(serializeSharePayload(payload));
}

// The quick link is always offered: a link is just text, and any app that
// carries text can carry it whatever the length. File import has far more
// friction, so we never withhold the link.
export function isDeepLinkEligible(_payload: SharePayload): boolean {
  return true;
}

// A QR code is offered whenever the encoded URL fits the format at all.
export function isQrEligible(payload: SharePayload): boolean {
  return buildDeepLinkUrl(payload).length <= QR_URL_MAX_CHARS;
}

// True when the QR is valid but dense enough to be awkward to scan — used to
// surface a "may be hard to scan" warning rather than hiding the option.
export function isQrDense(payload: SharePayload): boolean {
  return buildDeepLinkUrl(payload).length > QR_URL_DENSE_CHARS;
}

// Human-readable size alongside the raw byte count, e.g. 3072 → "3 KB".
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function buildDeepLinkUrl(payload: SharePayload): string {
  const encoded = base64EncodeUtf8(serializeSharePayload(payload));
  return `${DEEP_LINK_SCHEME}?d=${encoded}`;
}

export class DeepLinkParseError extends Error {}

// Accepts both a full dishision://import?d=... URL and a bare d= query value,
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

export const DISHISION_FILE_EXTENSION = '.dishision';

export function suggestedFileName(payload: SharePayload): string {
  const slug = payload.recipe.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'recipe'}${DISHISION_FILE_EXTENSION}`;
}
