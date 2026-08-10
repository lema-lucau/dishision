// §B4 / batch-2 A1 theme-creator bot: the propose_theme tool. From a prompt like
// "cozy autumn evening" the bot fills the theme creator's seed — mode + the three
// colours (background, accent, secondary) the app derives a full palette from
// (see customTheme.ts) — plus a suggested name. It may ALSO fine-tune individual
// derived tokens via `overrides` (e.g. nudge `ink2`, `amber`, a category colour)
// once the three seeds are set. The user reviews and tweaks before saving;
// nothing is applied automatically.
import type { ColourTokens, ThemeMode } from '../theme/themes';
import { OVERRIDABLE_TOKENS } from '../theme/customTheme';

const OVERRIDE_KEYS = OVERRIDABLE_TOKENS.map((t) => t.key);
const OVERRIDE_KEY_SET = new Set<string>(OVERRIDE_KEYS as string[]);

export const PROPOSE_THEME_TOOL = {
  name: 'propose_theme',
  description:
    'Propose a colour theme by filling the creator\'s seed. Return the light/dark mode, three hex colours (background, accent, secondary), and a short evocative name. The app derives the full coordinated palette from these — pick a background that sets the overall tone, an accent for buttons/active states, and a secondary (warm) accent that complements it. You MAY additionally fine-tune specific derived tokens via the optional `overrides` map when the user asks for a particular tweak (e.g. warmer body text, a punchier tint) — don\'t be shy about it. On a refinement turn, adjust the SAME palette rather than starting from scratch: only change what the request implies.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'A short, evocative theme name, e.g. "Autumn Hearth".' },
      mode: { type: 'string', enum: ['light', 'dark'], description: 'Whether this is a light or dark theme.' },
      background: { type: 'string', description: 'Background hex colour (#RRGGBB) — the overall ground/tone.' },
      accent: { type: 'string', description: 'Accent hex colour (#RRGGBB) — buttons and active states.' },
      secondary: { type: 'string', description: 'Secondary/warm accent hex colour (#RRGGBB) — passive time, secondary accents.' },
      overrides: {
        type: 'object',
        description:
          `Optional fine-tuning: a map of individual token names to #RRGGBB hex, applied on top of the derived palette. Use to nudge specific colours after setting the three seeds. Valid keys: ${OVERRIDE_KEYS.join(', ')}. Unknown keys and malformed hex are ignored.`,
        additionalProperties: { type: 'string' },
      },
    },
    required: ['name', 'mode', 'background', 'accent', 'secondary'],
  },
} as const;

export interface ProposedTheme {
  name: string;
  mode: ThemeMode;
  background: string;
  accent: string;
  secondary: string;
  /** Optional per-token fine-tuning the bot returned (already validated). */
  overrides?: Partial<ColourTokens>;
}

const HEX = /^#([0-9a-fA-F]{6})$/;

function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  // Expand a 3-digit shorthand to 6 so the rest of the app only sees #RRGGBB.
  const short = /^#([0-9a-fA-F]{3})$/.exec(withHash);
  const full = short ? `#${short[1].split('').map((c) => c + c).join('')}` : withHash;
  return HEX.test(full) ? full.toUpperCase() : null;
}

// Keep only known token keys with valid hex; drop everything else. Returns
// undefined when nothing survives so callers can skip merging.
function parseOverrides(value: unknown): Partial<ColourTokens> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const out: Partial<ColourTokens> = {};
  let any = false;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!OVERRIDE_KEY_SET.has(key)) continue;
    const hex = normalizeHex(raw);
    if (!hex) continue;
    out[key as keyof ColourTokens] = hex;
    any = true;
  }
  return any ? out : undefined;
}

// Normalise a raw propose_theme tool input; returns null if the essential
// colour fields are missing or malformed.
export function parseProposedTheme(input: unknown): ProposedTheme | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const background = normalizeHex(raw.background);
  const accent = normalizeHex(raw.accent);
  const secondary = normalizeHex(raw.secondary);
  if (!background || !accent || !secondary) return null;
  const mode: ThemeMode = raw.mode === 'dark' ? 'dark' : 'light';
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Custom theme';
  const overrides = parseOverrides(raw.overrides);
  return { name, mode, background, accent, secondary, ...(overrides ? { overrides } : {}) };
}
