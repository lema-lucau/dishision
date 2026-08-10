// §F Android hardware-back registry. Navigation in this app is custom and
// state-based (no React Navigation), so there's no built-in back stack for the
// hardware button to pop. Instead each dismissible layer registers a back
// handler while it's on screen; the app root's single BackHandler listener runs
// them newest-first (a LIFO of what's visually on top) until one consumes the
// press. Anything not consumed falls through to the tab-level / app-exit guard.
//
// RN's own <Modal> already routes hardware-back to its onRequestClose on
// Android, so sheets and confirm modals don't need to register here — only the
// non-modal, state-driven full-screen layers do.
import { useEffect, useRef } from 'react';

/** Returns true if the handler consumed the back press. */
export type BackHandlerFn = () => boolean;

const handlers: BackHandlerFn[] = [];

export function registerBackHandler(fn: BackHandlerFn): () => void {
  handlers.push(fn);
  return () => {
    const i = handlers.indexOf(fn);
    if (i >= 0) handlers.splice(i, 1);
  };
}

/** Run registered handlers newest-first; stop at the first that consumes the
 *  press. Returns true if any did. */
export function runBackHandlers(): boolean {
  for (let i = handlers.length - 1; i >= 0; i -= 1) {
    if (handlers[i]()) return true;
  }
  return false;
}

/** Register a back handler while `enabled`. The latest handler value is always
 *  used (via a ref) so callers don't have to memoise it, and registration only
 *  churns when `enabled` flips. */
export function useBackHandler(enabled: boolean, handler: BackHandlerFn): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    return registerBackHandler(() => ref.current());
  }, [enabled]);
}
