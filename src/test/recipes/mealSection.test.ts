// §5.4.1 Section control. The section IS the meal tag, so the whole feature is
// three pure tag operations — which is exactly why it needs no migration.
import { describe, expect, it } from 'vitest';
import { isMealTag, sectionFromTags, withSection } from '../../recipes/mealType';

describe('sectionFromTags (§5.4.1)', () => {
  it('reads the meal tag regardless of case', () => {
    expect(sectionFromTags(['Breakfast'])).toBe('breakfast');
    expect(sectionFromTags(['lunch', 'Quick'])).toBe('lunch');
    expect(sectionFromTags(['DESSERT'])).toBe('dessert');
  });

  it('defaults to dinner when there is no meal tag', () => {
    expect(sectionFromTags([])).toBe('dinner');
    expect(sectionFromTags(['Chicken', 'Comfort'])).toBe('dinner');
  });

  it('collapses two meal tags to the priority-order winner', () => {
    expect(sectionFromTags(['Dessert', 'Breakfast'])).toBe('breakfast');
    expect(sectionFromTags(['Dinner', 'Lunch'])).toBe('lunch');
  });
});

describe('withSection (§5.4.1)', () => {
  it('is mutually exclusive — the old meal tag goes', () => {
    expect(withSection(['Dinner', 'Chicken'], 'lunch')).toEqual(['Lunch', 'Chicken']);
  });

  it('strips every meal tag, not just the winning one', () => {
    expect(withSection(['Dessert', 'Breakfast', 'Quick'], 'dinner')).toEqual(['Dinner', 'Quick']);
  });

  it('adds a section to a recipe that had none, keeping the other tags in order', () => {
    expect(withSection(['Chicken', 'Comfort'], 'dinner')).toEqual(['Dinner', 'Chicken', 'Comfort']);
  });

  it('round-trips through sectionFromTags', () => {
    for (const section of ['breakfast', 'lunch', 'dinner', 'dessert'] as const) {
      expect(sectionFromTags(withSection(['Chicken'], section))).toBe(section);
    }
  });

  it('never leaves a duplicate when the section is unchanged', () => {
    const tags = withSection(withSection(['Chicken'], 'lunch'), 'lunch');
    expect(tags.filter(isMealTag)).toEqual(['Lunch']);
  });
});
