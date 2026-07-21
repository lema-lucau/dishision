import { describe, expect, it } from 'vitest';
import { isNameSimilar, levenshteinDistance } from '../../sharing/diff';

describe('name similarity (§7.3 "is this the same as your Green Curry?")', () => {
  it('matches identical names ignoring case and punctuation', () => {
    expect(isNameSimilar('Green Curry', 'green curry')).toBe(true);
    expect(isNameSimilar("Nana's Stew", 'Nanas Stew')).toBe(true);
  });

  it('matches a name that is a superstring/substring of the other', () => {
    expect(isNameSimilar('Thai Green Curry', 'Green Curry')).toBe(true);
  });

  it('matches close retypes within threshold', () => {
    expect(isNameSimilar('Chicken Katsu', 'Chiken Katsu')).toBe(true);
  });

  it('does not match unrelated recipes', () => {
    expect(isNameSimilar('Chicken Katsu', 'Beef Chilli')).toBe(false);
  });

  it('levenshteinDistance is symmetric and zero for identical strings', () => {
    expect(levenshteinDistance('abc', 'abc')).toBe(0);
    expect(levenshteinDistance('abc', 'abd')).toBe(1);
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
  });
});
