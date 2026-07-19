// The five-tab shell (§5.1). No routing library — the allowlist (§15.1)
// doesn't include one, and a flat bottom tab bar doesn't need one.
export type TabKey = 'home' | 'recipes' | 'plan' | 'cookLog' | 'profile';

export interface TabDef {
  key: TabKey;
  label: string;
  icon: string;
}

// Emoji, not an icon font — no icon library is on the §15.1 allowlist, and
// emoji is already the app's icon language (recipe tiles, avatars, §4.6).
export const TABS: TabDef[] = [
  { key: 'home', label: 'Home', icon: '🏠' },
  { key: 'recipes', label: 'Recipes', icon: '🍳' },
  { key: 'plan', label: 'Plan', icon: '🛒' },
  { key: 'cookLog', label: 'Cook Log', icon: '🍽️' },
  { key: 'profile', label: 'Profile', icon: '🙂' },
];
