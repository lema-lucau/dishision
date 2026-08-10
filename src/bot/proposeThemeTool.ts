// §B4 theme-creator bot: the propose_theme tool. From a prompt like "cozy
// autumn evening" the bot fills the theme creator's seed — mode + the three
// colours (background, accent, secondary) the app derives a full palette from
// (see customTheme.ts) — plus a suggested name. The user reviews and tweaks
// before saving; nothing is applied automatically.
import type { ThemeMode } from '../theme/themes';

export const PROPOSE_THEME_TOOL = {
  name: 'propose_theme',
  description:
    'Propose a colour theme by filling the creator\'s seed. Return the light/dark mode, three hex colours (background, accent, secondary), and a short evocative name. The app derives the full coordinated palette from these — pick a background that sets the overall tone, an accent for buttons/active states, and a secondary (warm) accent that complements it.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'A short, evocative theme name, e.g. "Autumn Hearth".' },
      mode: { type: 'string', enum: ['light', 'dark'], description: 'Whether this is a light or dark theme.' },
      background: { type: 'string', description: 'Background hex colour (#RRGGBB) — the overall ground/tone.' },
      accent: { type: 'string', description: 'Accent hex colour (#RRGGBB) — buttons and active states.' },
      secondary: { type: 'string', description: 'Secondary/warm accent hex colour (#RRGGBB) — passive time, secondary accents.' },
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
  return { name, mode, background, accent, secondary };
}
