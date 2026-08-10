// §E app-root household sync wiring. Runs the always-on foreground responder
// (a listener on the fixed SYNC_PORT while the app is foregrounded and not
// pairing), configures the auto-sync coordinator, and fires a mutual sync cycle
// on foreground. All native transport work is dynamically imported and wrapped
// so a device with no peer, no network, or no permission just no-ops quietly.
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { logger } from '../debug/logStore';
import type { DbClient } from '../db/DbClient';
import type { Profile } from '../profile/ensureProfile';
import { getAutoSyncEnabled } from '../settings/getSetting';
import { parseAddress, SYNC_PORT } from './address';
import { autoSyncCoordinator } from './autoSync';
import { listHouseholdMembers, type HouseholdMember } from './householdMutations';
import { getLocalAddress } from './localAddress';
import type { PairingSession } from './pairingProtocol';
import { useSyncListenerStore } from './syncListenerStore';
import type { LocalIdentity } from './syncProtocol';

// One member's half of a mutual cycle: pull their recipes + push our shared
// cooks, then push our ratings on a separate connection (§7.6). Their own
// foreground/change triggers cover the reverse direction. Silent on failure.
async function syncOneMember(db: DbClient, me: LocalIdentity, member: HouseholdMember): Promise<void> {
  if (!member.lastKnownAddress) return;
  const { host, port } = parseAddress(member.lastKnownAddress);
  const { connectToPeer } = await import('./tcpChannel');
  const { runInitiatorSync, runRatingsInitiator } = await import('./syncProtocol');

  const recipeChannel = await connectToPeer(host, port);
  const result = await runInitiatorSync(db, recipeChannel, me, member.personId, member.syncSecret);
  if (result.droppedByPeer) return; // peer removed us — nothing more to push

  const ratingsChannel = await connectToPeer(host, port);
  await runRatingsInitiator(db, ratingsChannel, me, member.personId, member.syncSecret);
}

export function useHouseholdSync(db: DbClient, profile: Profile): void {
  const meRef = useRef<LocalIdentity>({
    personId: profile.person_id,
    displayName: profile.display_name,
    avatarEmoji: profile.avatar_emoji,
    address: null,
  });
  // Keep identity fresh if the profile changes (name/avatar edit).
  meRef.current = { ...meRef.current, personId: profile.person_id, displayName: profile.display_name, avatarEmoji: profile.avatar_emoji };

  // Latest pairing session (if the pairing screen is open) — read via a ref so
  // the always-on listener's connection callback picks up the current value
  // without being torn down and rebuilt.
  const pairingSession = useSyncListenerStore((s) => s.pairingSession);
  const pairingSessionRef = useRef<PairingSession | null>(pairingSession);
  pairingSessionRef.current = pairingSession;

  // Configure the coordinator's runner once per db.
  useEffect(() => {
    autoSyncCoordinator.configure({
      isEnabled: () => getAutoSyncEnabled(db),
      runCycle: async () => {
        const members = await listHouseholdMembers(db);
        for (const member of members) {
          try {
            await syncOneMember(db, meRef.current, member);
          } catch (error) {
            // Offline / stale address / refused — expected, not user-facing.
            logger.warn('sync', 'Auto-sync with member failed', { personId: member.personId, error: String(error) });
          }
        }
      },
    });
    return () => autoSyncCoordinator.configure(null);
  }, [db]);

  // Foreground responder + foreground sync trigger. One listener on the fixed
  // port serves both regular sync and pairing (the pairing screen just supplies
  // its session via the store), so there's no port hand-off and no race.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let listener: { close(): void } | null = null;
    let cancelled = false;

    async function openListener(): Promise<void> {
      if (listener) return;
      try {
        const address = await getLocalAddress().catch(() => null);
        if (address) meRef.current = { ...meRef.current, address };
        if (cancelled) return;
        const { startListener } = await import('./tcpChannel');
        const { handleIncomingConnection } = await import('./pairingProtocol');
        if (cancelled) return;
        listener = startListener(SYNC_PORT, (channel) => {
          // Pass the current pairing session (or null) so pairing works while
          // the pairing screen is open, and regular sync works otherwise.
          handleIncomingConnection(db, channel, meRef.current, pairingSessionRef.current).catch((err) =>
            logger.warn('sync', 'Incoming connection failed', { error: String(err) }),
          );
        });
      } catch (error) {
        logger.warn('sync', 'Could not start foreground responder', { error: String(error) });
      }
    }

    function closeListener(): void {
      listener?.close();
      listener = null;
    }

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void openListener();
        void autoSyncCoordinator.runNow();
      } else {
        closeListener();
      }
    });

    // The app is active when this mounts.
    void openListener();
    void autoSyncCoordinator.runNow();

    return () => {
      cancelled = true;
      sub.remove();
      closeListener();
    };
  }, [db]);
}
