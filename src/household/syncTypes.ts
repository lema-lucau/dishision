// §7.5 wire protocol messages. NDJSON — one of these per line.
import type { SharePayload } from '../sharing/payload';
import type { RatingEntry } from './opinionSync';
import type { SharedCookEntry } from './sharedCooks';

export interface ManifestItem {
  shareId: string;
  updatedAt: string;
}

export interface PayloadEntry {
  shareId: string;
  payload: SharePayload;
  isFavourite: boolean;
  favouritedAt: string | null;
}

export type SyncMessage =
  | { type: 'hello'; personId: string; secret: string }
  | { type: 'hello_ack'; personId: string }
  // §E: address is re-exchanged each sync so a peer whose DHCP lease changed
  // self-heals its stored last_known_address next time they connect either way.
  | { type: 'profile'; displayName: string; avatarEmoji: string; address?: string | null }
  | { type: 'tombstone_check' }
  | { type: 'tombstone'; removed: boolean }
  | { type: 'manifest_request' }
  | { type: 'manifest'; items: ManifestItem[] }
  | { type: 'payload_request'; shareIds: string[] }
  | { type: 'payload'; entries: PayloadEntry[] }
  // §7 shared cooks: the initiator pushes cooks it logged "with" this peer;
  // the peer applies them as its own cook_log rows and acks how many landed.
  | { type: 'shared_cooks'; entries: SharedCookEntry[] }
  | { type: 'shared_cooks_ack'; applied: number; skipped: number }
  | { type: 'done' }
  | { type: 'error'; message: string }
  // §7.6 opinion sync — a distinct opening message from `hello`, because
  // sending ratings is a separate explicit act, never folded into a recipe
  // sync. Authenticated by the same pair secret; the initiator pushes its
  // {share_id, stars} and the responder stores them in household_rating.
  | { type: 'ratings_hello'; personId: string; secret: string }
  | { type: 'ratings_hello_ack'; personId: string }
  | { type: 'ratings'; entries: RatingEntry[] }
  | { type: 'ratings_ack'; stored: number }
  // §5.11 pairing — a distinct opening message from `hello` because the
  // connecting phone isn't a known household_member yet: it proves itself
  // with either the QR's secret directly, or the fallback 6-digit code.
  | { type: 'pair_hello'; personId: string; displayName: string; avatarEmoji: string; secret?: string; code?: string }
  | { type: 'pair_accept'; personId: string; displayName: string; avatarEmoji: string; secret: string }
  | { type: 'pair_reject'; reason: string };

// The transport abstraction the protocol drivers run against — a real TCP
// connection (tcpChannel.ts) or an in-memory pair (test double). Keeping
// the protocol logic itself free of react-native-tcp-socket is what makes
// it unit-testable without a real socket (§11.1 native-boundary pattern).
export interface SyncChannel {
  send(message: SyncMessage): Promise<void>;
  /** Rejects if the connection closes before a message arrives. */
  receive(): Promise<SyncMessage>;
  close(): void;
}

export class SyncAuthError extends Error {}
export class SyncConnectionClosedError extends Error {}
