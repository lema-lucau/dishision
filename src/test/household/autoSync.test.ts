import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoSyncCoordinator, type AutoSyncRunner } from '../../household/autoSync';

function runner(over: Partial<AutoSyncRunner> & { runCycle: AutoSyncRunner['runCycle'] }): AutoSyncRunner {
  return { isEnabled: async () => true, ...over };
}

describe('AutoSyncCoordinator (§E)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces a burst of dirty signals into a single cycle', async () => {
    let cycles = 0;
    const c = new AutoSyncCoordinator(1000);
    c.configure(runner({ runCycle: async () => { cycles += 1; } }));
    c.markDirty();
    c.markDirty();
    c.markDirty();
    expect(cycles).toBe(0); // nothing yet — still debouncing
    await vi.advanceTimersByTimeAsync(1000);
    expect(cycles).toBe(1);
  });

  it('does not run a cycle when disabled', async () => {
    let cycles = 0;
    const c = new AutoSyncCoordinator(1000);
    c.configure(runner({ isEnabled: async () => false, runCycle: async () => { cycles += 1; } }));
    await c.runNow();
    expect(cycles).toBe(0);
  });

  it('guards against overlapping cycles', async () => {
    let started = 0;
    let release: () => void = () => {};
    const c = new AutoSyncCoordinator(1000);
    c.configure(
      runner({
        runCycle: () =>
          new Promise<void>((resolve) => {
            started += 1;
            release = resolve;
          }),
      }),
    );
    const first = c.runNow();
    const second = c.runNow(); // should be a no-op while the first is in flight
    await vi.advanceTimersByTimeAsync(0); // let isEnabled() resolve so runCycle starts
    expect(started).toBe(1);
    release();
    await Promise.all([first, second]);
    expect(started).toBe(1);
    // A later run works again once the first finished.
    const third = c.runNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toBe(2);
    release();
    await third;
  });

  it('swallows a cycle error and stays runnable', async () => {
    let cycles = 0;
    const c = new AutoSyncCoordinator(1000);
    c.configure(
      runner({
        runCycle: async () => {
          cycles += 1;
          if (cycles === 1) throw new Error('peer offline');
        },
      }),
    );
    await expect(c.runNow()).resolves.toBeUndefined(); // no throw
    await c.runNow();
    expect(cycles).toBe(2);
  });

  it('is a no-op until configured', async () => {
    const c = new AutoSyncCoordinator(1000);
    c.markDirty();
    await vi.advanceTimersByTimeAsync(1000);
    await expect(c.runNow()).resolves.toBeUndefined();
  });
});
