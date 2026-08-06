// The five-tab shell (§5.1). No routing library — the allowlist (§15.1)
// doesn't include one, and a flat bottom tab bar doesn't need one.
import type { ComponentType } from 'react';
import { BasketIcon, HomeIcon, PanIcon, PersonIcon, PlateIcon } from '../components/icons';

export type TabKey = 'home' | 'recipes' | 'plan' | 'cookLog' | 'profile';

export interface TabDef {
  key: TabKey;
  label: string;
  Icon: ComponentType<{ size?: number; color: string; strokeWidth?: number }>;
}

// Drawn SVG, not emoji. No icon *library* is on the §15.1 allowlist, but
// react-native-svg is (it backs QR codes), and the tab bar is the one piece of
// chrome that's on screen the whole time — emoji there set the tone for
// everything else.
export const TABS: TabDef[] = [
  { key: 'home', label: 'Home', Icon: HomeIcon },
  { key: 'recipes', label: 'Recipes', Icon: PanIcon },
  { key: 'plan', label: 'Plan', Icon: BasketIcon },
  { key: 'cookLog', label: 'Cook Log', Icon: PlateIcon },
  { key: 'profile', label: 'Profile', Icon: PersonIcon },
];
