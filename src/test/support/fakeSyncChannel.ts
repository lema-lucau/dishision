// In-memory SyncChannel pair for protocol tests — no real socket, so the
// protocol logic in syncProtocol.ts is testable in the same process
// without react-native-tcp-socket (§11.1 native-boundary pattern).
//
// Both ends share one state object (one queue per direction, one closed
// flag) rather than each end tracking its own peer reference — simpler to
// reason about than a two-object cascade, and avoids any ambiguity about
// which side's waiters get rejected when both ends close around the same
// time. Every pending-receive promise gets a no-op safety-net `.catch`
// attached the moment it's created (a well-known pattern): if a race ever
// leaves one abandoned, it fails quietly instead of surfacing as an
// unrelated test's "unhandled rejection".
import type { SyncChannel, SyncMessage } from '../../household/syncTypes';
import { SyncConnectionClosedError } from '../../household/syncTypes';

interface Waiter {
  resolve: (msg: SyncMessage) => void;
  reject: (err: Error) => void;
}

interface SharedState {
  aToB: SyncMessage[];
  bToA: SyncMessage[];
  waitingA: Waiter[]; // A is blocked in receive(), waiting on bToA
  waitingB: Waiter[]; // B is blocked in receive(), waiting on aToB
  closed: boolean;
}

function makeEnd(state: SharedState, isA: boolean): SyncChannel {
  const outQueue = () => (isA ? state.aToB : state.bToA);
  const inQueue = () => (isA ? state.bToA : state.aToB);
  const outWaiters = () => (isA ? state.waitingB : state.waitingA);
  const inWaiters = () => (isA ? state.waitingA : state.waitingB);

  return {
    async send(message) {
      if (state.closed) throw new SyncConnectionClosedError('Channel closed');
      const waiter = outWaiters().shift();
      if (waiter) waiter.resolve(message);
      else outQueue().push(message);
    },
    async receive() {
      const queue = inQueue();
      if (queue.length > 0) return queue.shift()!;
      if (state.closed) throw new SyncConnectionClosedError('Channel closed');
      const promise = new Promise<SyncMessage>((resolve, reject) => {
        inWaiters().push({ resolve, reject });
      });
      promise.catch(() => {}); // safety net — see file header
      return promise;
    },
    close() {
      if (state.closed) return;
      state.closed = true;
      const err = new SyncConnectionClosedError('Channel closed');
      for (const waiter of [...state.waitingA, ...state.waitingB]) waiter.reject(err);
      state.waitingA = [];
      state.waitingB = [];
    },
  };
}

export function createChannelPair(): [SyncChannel, SyncChannel] {
  const state: SharedState = { aToB: [], bToA: [], waitingA: [], waitingB: [], closed: false };
  return [makeEnd(state, true), makeEnd(state, false)];
}
