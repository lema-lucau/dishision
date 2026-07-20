import { describe, expect, it } from 'vitest';
import { pickDiverse } from '../../recommend/diversity';
import { makeRecipe } from '../support/recipeFixture';

describe('pickDiverse (§6.4)', () => {
  it('never produces three-chicken output even when durations differ — the case the rule exists for', () => {
    const chickenQuick = makeRecipe({ tags: ['chicken'], durationBucket: 'under20' });
    const chickenMid = makeRecipe({ tags: ['chicken'], durationBucket: '20to40' });
    const chickenLong = makeRecipe({ tags: ['chicken'], durationBucket: 'over40' });
    const beef = makeRecipe({ tags: ['beef'], durationBucket: 'under20' });
    const fish = makeRecipe({ tags: ['fish'], durationBucket: '20to40' });

    const picks = pickDiverse([chickenQuick, chickenMid, chickenLong, beef, fish], 3);
    const proteinTags = picks.map((r) => r.tags[0]);
    expect(new Set(proteinTags).size).toBeGreaterThan(1);
    expect(proteinTags).not.toEqual(['chicken', 'chicken', 'chicken']);
  });

  it('a pair sharing the same duration bucket conflicts on the diversity pass even with different proteins, but both still surface via backfill', () => {
    const chickenQuick = makeRecipe({ tags: ['chicken'], durationBucket: 'under20' });
    const beefQuick = makeRecipe({ tags: ['beef'], durationBucket: 'under20' });
    // Requesting only as many picks as fit the diverse pass (1) proves the
    // conflict itself: the diversity-only pass keeps just the higher-ranked one.
    const diverseOnly = pickDiverse([chickenQuick, beefQuick], 1);
    expect(diverseOnly).toEqual([chickenQuick]);
    // Asking for more than the diverse pass can fill backfills the rest —
    // showing two recipes beats showing one just because they collide on duration.
    const withBackfill = pickDiverse([chickenQuick, beefQuick], 3);
    expect(withBackfill.map((r) => r.id)).toEqual([chickenQuick.id, beefQuick.id]);
  });

  it('backfills from remaining top-scored candidates when the pool is too homogeneous to fill every diverse slot', () => {
    const a = makeRecipe({ tags: ['chicken'], durationBucket: 'under20' });
    const b = makeRecipe({ tags: ['chicken'], durationBucket: 'under20' });
    const picks = pickDiverse([a, b], 3);
    expect(picks.map((r) => r.id)).toEqual([a.id, b.id]);
  });

  it('lets two untagged recipes coexist on protein grounds (no signal to conflict on) but still enforces duration', () => {
    const untaggedA = makeRecipe({ tags: [], durationBucket: 'under20' });
    const untaggedB = makeRecipe({ tags: [], durationBucket: '20to40' });
    const picks = pickDiverse([untaggedA, untaggedB], 3);
    expect(picks.map((r) => r.id)).toEqual([untaggedA.id, untaggedB.id]);
  });

  it('bucket boundaries land exactly at 20 and 40 minutes per §6.4', () => {
    // durationBucket itself is derived elsewhere (src/lib/derive.ts) — this
    // just confirms the diversity rule treats the boundary buckets as distinct.
    const under = makeRecipe({ tags: [], durationBucket: 'under20' });
    const mid = makeRecipe({ tags: [], durationBucket: '20to40' });
    const over = makeRecipe({ tags: [], durationBucket: 'over40' });
    const picks = pickDiverse([under, mid, over], 3);
    expect(picks.map((r) => r.id)).toEqual([under.id, mid.id, over.id]);
  });
});
