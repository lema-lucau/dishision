import { create } from 'zustand';

interface SettingsStore {
  debugMode: boolean;
  /** True until the persisted value has been read from the DB once (App start).
   * Guards against a first render defaulting Debug off before hydration. */
  hydrated: boolean;
  /** Sets the in-memory value only. Persistence to the `setting` table is the
   * caller's job (see setDebugMode in setSetting.ts) — the store stays DB-free
   * so it can be read from anywhere without a db handle. */
  setDebugMode: (value: boolean) => void;
  hydrate: (value: boolean) => void;
}

// Debug mode is now persisted (§12 dev tooling): the value lives in the
// `setting` table and is hydrated into this store once at app start, so an
// enabled Debug entry survives a restart instead of resetting off every launch.
// Off by default until the user turns it on.
export const useSettingsStore = create<SettingsStore>((set) => ({
  debugMode: false,
  hydrated: false,
  setDebugMode: (value) => set({ debugMode: value }),
  hydrate: (value) => set({ debugMode: value, hydrated: true }),
}));
