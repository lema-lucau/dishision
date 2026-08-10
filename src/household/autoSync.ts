// §E auto-sync coordinator. Keeps household sync "just works" by running a
// mutual sync cycle on app-foreground and after a debounced local change, while
// guarding against overlap and failing silently when a peer is offline. The
// coordinator itself is transport-agnostic and unit-testable — the app-root
// hook (useHouseholdSync.ts) injects the runner that does the real native work.

export interface AutoSyncRunner {
  /** Whether auto-sync is enabled (reads the setting). */
  isEnabled(): Promise<boolean>;
  /** Run one mutual sync cycle across every household member. Must swallow
   * per-peer failures itself; the coordinator also guards with try/catch. */
  runCycle(): Promise<void>;
}

export class AutoSyncCoordinator {
  private inFlight = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private runner: AutoSyncRunner | null = null;
  private readonly debounceMs: number;

  constructor(debounceMs = 4000) {
    this.debounceMs = debounceMs;
  }

  configure(runner: AutoSyncRunner | null): void {
    this.runner = runner;
  }

  isConfigured(): boolean {
    return this.runner != null;
  }

  /** Run a cycle now, unless one is already in flight (overlap guard) or the
   * feature is disabled. Never throws — a peer being offline is not an error. */
  async runNow(): Promise<void> {
    const runner = this.runner;
    if (!runner || this.inFlight) return;
    this.inFlight = true;
    try {
      if (!(await runner.isEnabled())) return;
      await runner.runCycle();
    } catch {
      // Silent per §E — offline peers, refused connections, etc. are expected.
    } finally {
      this.inFlight = false;
    }
  }

  /** A relevant local change happened — schedule a debounced cycle so a burst
   * of edits collapses into one sync. */
  markDirty(): void {
    if (!this.runner) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.runNow();
    }, this.debounceMs);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.runner = null;
  }
}

// The app-wide singleton the mutation sites and the app-root hook share.
export const autoSyncCoordinator = new AutoSyncCoordinator();

/** Emit from a relevant local change (cook logged, visibility toggled, rating
 * written, shared cook enqueued). A no-op until the app root configures the
 * coordinator, so it's safe to call from anywhere, including tests. */
export function markHouseholdDirty(): void {
  autoSyncCoordinator.markDirty();
}
