import { create } from 'zustand';

interface SettingsStore {
  debugMode: boolean;
  toggleDebugMode: () => void;
}

// In-memory for S0. Settings persistence via the `setting` table arrives in S1 (§2.3).
export const useSettingsStore = create<SettingsStore>((set) => ({
  debugMode: false,
  toggleDebugMode: () => set((s) => ({ debugMode: !s.debugMode })),
}));
