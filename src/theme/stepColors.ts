// Per-tag-type colours for step badges/cards (Prep, Cook, Time, and
// arbitrary lane/equipment names like Grill/Pan). Deliberately derived from
// tokens every theme already defines rather than adding new per-theme colour
// fields — lane names are free text (§5.5 step_lane), so there's no fixed
// set to hand-pick colours for; hashing into the existing 7-colour
// categoryColors palette gives every theme enough distinct hues for free.
import type { Phase } from '../seed/types';
import type { AppTheme } from './ThemeContext';

export interface TagColor {
  bg: string;
  fg: string;
}

export function phaseColor(theme: AppTheme, phase: Phase): TagColor {
  return phase === 'prep'
    ? { bg: theme.colors.amberTint, fg: theme.colors.amberText }
    : { bg: theme.colors.accentTint, fg: theme.colors.accentText };
}

export function timeTagColor(theme: AppTheme): TagColor {
  return { bg: theme.colors.greenTint, fg: theme.colors.green };
}

export function laneColor(theme: AppTheme, laneName: string): TagColor {
  const palette = Object.values(theme.categoryColors);
  let hash = 0;
  for (let i = 0; i < laneName.length; i++) {
    hash = (hash * 31 + laneName.charCodeAt(i)) | 0;
  }
  const color = palette[Math.abs(hash) % palette.length];
  return { bg: `${color}26`, fg: color }; // '26' hex ≈ 15% alpha, for a soft tint background
}
