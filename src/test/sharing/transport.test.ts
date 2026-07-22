import { describe, expect, it } from 'vitest';
import { base64DecodeUtf8, base64EncodeUtf8, utf8ByteLength } from '../../sharing/base64';
import { PAYLOAD_VERSION, type SharePayload } from '../../sharing/payload';
import {
  buildDeepLinkUrl,
  DeepLinkParseError,
  isDeepLinkEligible,
  isQrEligible,
  parseDeepLinkUrl,
  payloadByteLength,
  suggestedFileName,
} from '../../sharing/transport';

function makePayload(overrides: Partial<SharePayload> = {}): SharePayload {
  return {
    v: PAYLOAD_VERSION,
    share_id: 'abc-123',
    recipe: {
      name: 'Thai Green Curry',
      description: 'Weeknight staple.',
      base_servings: 2,
      timeline_mode: 'sequential',
      origin_label: null,
      origin_url: null,
      photo: null,
      photo_emoji: '🍛',
    },
    ingredients: [{ display_name: 'Coconut milk', canonical_name: 'Coconut milk', quantity: 400, unit: 'ml', scalable: true, optional: false }],
    lanes: [],
    steps: [{ lane: null, phase: 'cook', instruction: 'Simmer', duration_seconds: 900, start_offset_seconds: 0, effort: 'passive', important: false }],
    tags: ['chicken', 'thai'],
    ...overrides,
  };
}

describe('base64 codec (UTF-8 safe)', () => {
  it('round-trips ASCII and unicode content', () => {
    expect(base64DecodeUtf8(base64EncodeUtf8('hello world'))).toBe('hello world');
    expect(base64DecodeUtf8(base64EncodeUtf8('Nana\'s 🍛 recipe — café'))).toBe('Nana\'s 🍛 recipe — café');
    expect(base64DecodeUtf8(base64EncodeUtf8(''))).toBe('');
  });

  it('utf8ByteLength counts multi-byte characters correctly', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('café')).toBe(5); // é is 2 bytes
    expect(utf8ByteLength('🍛')).toBe(4); // astral plane emoji is 4 bytes
  });
});

describe('deep link transport (§7.2)', () => {
  it('round-trips a payload through build -> parse', () => {
    const payload = makePayload();
    const url = buildDeepLinkUrl(payload);
    expect(url.startsWith('dishision://import?d=')).toBe(true);
    const parsed = parseDeepLinkUrl(url);
    expect(parsed).toEqual(payload);
  });

  it('also parses a bare d= query fragment (from a scanned QR body)', () => {
    const payload = makePayload();
    const url = buildDeepLinkUrl(payload);
    const bare = url.split('?')[1];
    expect(parseDeepLinkUrl(bare)).toEqual(payload);
  });

  it('rejects garbage input', () => {
    expect(() => parseDeepLinkUrl('dishision://import?d=')).toThrow(DeepLinkParseError);
    expect(() => parseDeepLinkUrl('dishision://import?d=not-valid-base64-json')).toThrow();
  });

  it('flags a payload too large for a deep link (2 KB) or QR (1.2 KB)', () => {
    const small = makePayload();
    expect(isDeepLinkEligible(small)).toBe(true);
    expect(isQrEligible(small)).toBe(true);

    const huge = makePayload({
      steps: Array.from({ length: 200 }, (_, i) => ({
        lane: null,
        phase: 'cook' as const,
        instruction: `Step ${i} with a fairly long instruction to pad out the payload size considerably`,
        duration_seconds: 60,
        start_offset_seconds: i * 60,
        effort: 'active' as const,
        important: false,
      })),
    });
    expect(payloadByteLength(huge)).toBeGreaterThan(2048);
    expect(isDeepLinkEligible(huge)).toBe(false);
    expect(isQrEligible(huge)).toBe(false);

    // Something between 1.2 KB and 2 KB: deep-link eligible, not QR eligible.
    const medium = makePayload({
      steps: Array.from({ length: 7 }, (_, i) => ({
        lane: null,
        phase: 'cook' as const,
        instruction: `Step ${i} with a fairly long instruction to pad out the payload size`,
        duration_seconds: 60,
        start_offset_seconds: i * 60,
        effort: 'active' as const,
        important: false,
      })),
    });
    const bytes = payloadByteLength(medium);
    expect(bytes).toBeGreaterThan(1200);
    expect(bytes).toBeLessThan(2048);
    expect(isQrEligible(medium)).toBe(false);
    expect(isDeepLinkEligible(medium)).toBe(true);
  });
});

describe('suggestedFileName', () => {
  it('slugifies the recipe name and adds the .dishision extension', () => {
    expect(suggestedFileName(makePayload())).toBe('thai-green-curry.dishision');
    expect(suggestedFileName(makePayload({ recipe: { ...makePayload().recipe, name: "Nana's Stew!!" } }))).toBe('nana-s-stew.dishision');
  });
});
