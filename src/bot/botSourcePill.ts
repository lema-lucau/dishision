// §B9: how a chat was created, shown as a labelled pill in the Chat History
// list, the history filter row, and the open chat's own header. Centralised so
// all three stay consistent.
import type { AppTheme } from '../theme/ThemeContext';
import type { BotChatSource } from './types';

export const SOURCE_LABEL: Record<BotChatSource, string> = {
  chat: 'Chat',
  paste_text: 'Pasted',
  link: 'Link',
  existing_recipe: 'Refined',
  cook_log: 'From Cook',
};

// The order sources appear in the filter row.
export const SOURCE_ORDER: BotChatSource[] = ['chat', 'paste_text', 'link', 'existing_recipe', 'cook_log'];

// A distinct hue per source, pulled from the active theme (never hardcoded) so
// pills stay legible across every theme, Hearth through Midnight Kitchen. The
// pill renders this only as a small dot beside a label drawn in the theme's ink
// colour, so readability never rides on the hue itself — a colour that's near
// the background on one theme still reads, because the text doesn't use it.
export function sourcePillColor(theme: AppTheme, source: BotChatSource): string {
  switch (source) {
    case 'chat':
      return theme.colors.accent; // the default / most common path
    case 'paste_text':
      return theme.categoryColors.other; // warm neutral / sand
    case 'link':
      return theme.categoryColors.pork; // terracotta family
    case 'existing_recipe':
      return theme.colors.amber; // amber
    case 'cook_log':
      return theme.categoryColors.fish; // a distinct fifth hue
  }
}
