import { describe, expect, it } from 'vitest';
import { computeLeftoverPlan } from '../../cooking/leftover';

describe('computeLeftoverPlan (§5.7)', () => {
  it('returns null when everything made was eaten', () => {
    expect(computeLeftoverPlan(2, 2, '2026-07-16T18:00:00.000Z')).toBeNull();
  });

  it('returns null when eaten exceeds made (no negative leftovers)', () => {
    expect(computeLeftoverPlan(2, 3, '2026-07-16T18:00:00.000Z')).toBeNull();
  });

  it('creates a leftover row when made > eaten, expiring 3 days later by default', () => {
    const plan = computeLeftoverPlan(4, 2, '2026-07-16T18:00:00.000Z');
    expect(plan?.servingsRemaining).toBe(2);
    expect(plan?.expiresAt).toBe('2026-07-19T18:00:00.000Z');
  });

  it('honours a custom expiry window', () => {
    const plan = computeLeftoverPlan(4, 2, '2026-07-16T18:00:00.000Z', 1);
    expect(plan?.expiresAt).toBe('2026-07-17T18:00:00.000Z');
  });
});
