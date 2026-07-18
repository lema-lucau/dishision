import { create } from 'zustand';

interface UiChromeStore {
  tabBarHidden: boolean;
  setTabBarHidden: (hidden: boolean) => void;
}

// Cooking Mode hides the tab bar (too much vertical space is precious
// there) — a screen sets this on mount and must clear it on unmount.
export const useUiChromeStore = create<UiChromeStore>((set) => ({
  tabBarHidden: false,
  setTabBarHidden: (hidden) => set({ tabBarHidden: hidden }),
}));
