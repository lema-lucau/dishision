// §E: the app-root responder owns the single fixed SYNC_PORT listener while
// foregrounded (useHouseholdSync). Pairing needs that same connection but with
// an active PairingSession the app-root responder doesn't otherwise have — so
// the pairing screen publishes its session here instead of opening a second,
// port-conflicting listener. The app-root responder passes the current session
// (or null) into handleIncomingConnection, so one listener serves both regular
// sync and pairing without any port hand-off race.
import { create } from 'zustand';
import type { PairingSession } from './pairingProtocol';

interface SyncListenerStore {
  pairingSession: PairingSession | null;
  setPairingSession: (session: PairingSession | null) => void;
}

export const useSyncListenerStore = create<SyncListenerStore>((set) => ({
  pairingSession: null,
  setPairingSession: (session) => set({ pairingSession: session }),
}));
