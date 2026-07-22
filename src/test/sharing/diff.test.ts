import { describe, expect, it } from 'vitest';
import { buildDetailedDiff, isNameSimilar, levenshteinDistance, mergePayloads } from '../../sharing/diff';
import { PAYLOAD_VERSION, type SharePayload } from '../../sharing/payload';

function makePayload(overrides: Partial<SharePayload> = {}): SharePayload {
  return {
    v: PAYLOAD_VERSION,
    share_id: 'abc-123',
    recipe: {
      name: 'Thai Green Curry',
      description: 'Weeknight staple.',
      base_servings: 2,
      timeline_mode: 'sequential',
      origin_label: null,
      origin_url: null,
      photo: null,
      photo_emoji: '🍛',
    },
    ingredients: [
      { display_name: 'Coconut milk', canonical_name: 'Coconut milk', quantity: 400, unit: 'ml', scalable: true, optional: false },
    ],
    lanes: [],
    steps: [
      { lane: null, phase: 'cook', instruction: 'Simmer', duration_seconds: 900, start_offset_seconds: 0, effort: 'passive', important: false },
    ],
    tags: ['thai'],
    ...overrides,
  };
}

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

describe('buildDetailedDiff', () => {
  it('flags no changes between identical payloads', () => {
    const rows = buildDetailedDiff(makePayload(), makePayload());
    expect(rows.every((r) => !r.changed)).toBe(true);
  });

  it('reports a scalar change with both sides', () => {
    const rows = buildDetailedDiff(makePayload(), makePayload({ recipe: { ...makePayload().recipe, name: 'Red Curry' } }));
    const nameRow = rows.find((r) => r.field === 'name');
    expect(nameRow?.changed).toBe(true);
    expect(nameRow).toMatchObject({ kind: 'scalar', local: 'Thai Green Curry', incoming: 'Red Curry' });
  });

  it('reports added and removed list items line-by-line', () => {
    const incoming = makePayload({
      ingredients: [
        { display_name: 'Coconut milk', canonical_name: 'Coconut milk', quantity: 400, unit: 'ml', scalable: true, optional: false },
        { display_name: 'Chicken thigh', canonical_name: 'Chicken thigh', quantity: 300, unit: 'g', scalable: true, optional: false },
      ],
    });
    const rows = buildDetailedDiff(makePayload(), incoming);
    const ingRow = rows.find((r) => r.field === 'ingredients');
    expect(ingRow?.changed).toBe(true);
    if (ingRow?.kind !== 'list') throw new Error('expected list row');
    expect(ingRow.added.some((l) => l.includes('Chicken thigh'))).toBe(true);
    expect(ingRow.removed).toHaveLength(0);
  });
});

describe('mergePayloads', () => {
  it('takes only the fields marked, defaulting the rest to the local value', () => {
    const local = makePayload();
    const incoming = makePayload({
      share_id: 'xyz-999',
      recipe: { ...local.recipe, name: 'Red Curry', base_servings: 4 },
      tags: ['thai', 'spicy'],
    });
    const merged = mergePayloads(local, incoming, { name: true });
    expect(merged.recipe.name).toBe('Red Curry'); // taken
    expect(merged.recipe.base_servings).toBe(2); // kept local
    expect(merged.tags).toEqual(['thai']); // kept local
    expect(merged.share_id).toBe('xyz-999'); // adopts incoming lineage
  });

  it('reproduces the local recipe when nothing is taken', () => {
    const local = makePayload();
    const incoming = makePayload({ recipe: { ...local.recipe, name: 'Red Curry' }, tags: ['x'] });
    const merged = mergePayloads(local, incoming, {});
    expect(merged.recipe.name).toBe('Thai Green Curry');
    expect(merged.tags).toEqual(['thai']);
  });
});
