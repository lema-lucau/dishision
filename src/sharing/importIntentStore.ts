// Holds a payload that arrived from outside the app's own UI — a
// preppie://import deep link or a tapped .preppie file — until the Recipes
// tab is ready to show the import preview (§7.3: "never write silently",
// so this only ever queues a payload for review, never writes anything).
import { create } from 'zustand';
import type { SharePayload } from './payload';

interface ImportIntentState {
  pending: SharePayload | null;
  setPending: (payload: SharePayload) => void;
  clear: () => void;
}

export const useImportIntentStore = create<ImportIntentState>((set) => ({
  pending: null,
  setPending: (payload) => set({ pending: payload }),
  clear: () => set({ pending: null }),
}));
