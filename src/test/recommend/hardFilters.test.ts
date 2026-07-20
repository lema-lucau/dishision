import { describe, expect, it } from 'vitest';
import { applyHardFilters } from '../../recommend/hardFilters';
import { makeRecipe } from '../support/recipeFixture';

const NOW = new Date('2026-07-19T18:00:00.000Z').getTime();

describe('applyHardFilters (§6.2)', () => {
  it('excludes never_again regardless of recency window', () => {
    const excluded = makeRecipe({ exclusion: { kind: 'never_again', expiresAt: null } });
    const kept = makeRecipe();
    const result = applyHardFilters([excluded, kept], { now: NOW, recencyWindowDays: 0, yesterdaysPrimaryProtein: null });
    expect(result.map((r) => r.id)).toEqual([kept.id]);
  });

  it('excludes an active not_tonight but not an expired one', () => {
    const active = makeRecipe({ exclusion: { kind: 'not_tonight', expiresAt: new Date(NOW + 86400000).toISOString() } });
    const expired = makeRecipe({ exclusion: { kind: 'not_tonight', expiresAt: new Date(NOW - 86400000).toISOString() } });
    const result = applyHardFilters([active, expired], { now: NOW, recencyWindowDays: 0, yesterdaysPrimaryProtein: null });
    expect(result.map((r) => r.id)).toEqual([expired.id]);
  });

  it('excludes anything cooked inside the recency window', () => {
    const recentlyCooked = makeRecipe({ lastCookedAt: new Date(NOW - 2 * 86400000).toISOString() });
    const longAgo = makeRecipe({ lastCookedAt: new Date(NOW - 10 * 86400000).toISOString() });
    const neverCooked = makeRecipe({ lastCookedAt: null });
    const result = applyHardFilters([recentlyCooked, longAgo, neverCooked], {
      now: NOW,
      recencyWindowDays: 5,
      yesterdaysPrimaryProtein: null,
    });
    expect(result.map((r) => r.id).sort()).toEqual([longAgo.id, neverCooked.id].sort());
  });

  it('0 disables the recency filter entirely', () => {
    const recentlyCooked = makeRecipe({ lastCookedAt: new Date(NOW - 60000).toISOString() });
    const result = applyHardFilters([recentlyCooked], { now: NOW, recencyWindowDays: 0, yesterdaysPrimaryProtein: null });
    expect(result).toHaveLength(1);
  });

  it('excludes a recipe sharing yesterday\'s primary protein', () => {
    const sameProtein = makeRecipe({ tags: ['chicken'] });
    const otherProtein = makeRecipe({ tags: ['beef'] });
    const result = applyHardFilters([sameProtein, otherProtein], {
      now: NOW,
      recencyWindowDays: 0,
      yesterdaysPrimaryProtein: 'chicken',
    });
    expect(result.map((r) => r.id)).toEqual([otherProtein.id]);
  });

  it('exempts an untagged recipe from the primary-protein filter', () => {
    const untagged = makeRecipe({ tags: [] });
    const result = applyHardFilters([untagged], { now: NOW, recencyWindowDays: 0, yesterdaysPrimaryProtein: 'chicken' });
    expect(result).toHaveLength(1);
  });

  it('applies no primary-protein filter when yesterday had none (no cook, or untagged)', () => {
    const chicken = makeRecipe({ tags: ['chicken'] });
    const result = applyHardFilters([chicken], { now: NOW, recencyWindowDays: 0, yesterdaysPrimaryProtein: null });
    expect(result).toHaveLength(1);
  });
});
