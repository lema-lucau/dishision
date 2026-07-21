import { describe, expect, it } from 'vitest';
import { pluralizeUnit } from '../../lib/unitLabels';

describe('pluralizeUnit', () => {
  it('renames the internal "unit" base unit to item/items', () => {
    expect(pluralizeUnit(1, 'unit')).toBe('item');
    expect(pluralizeUnit(2, 'unit')).toBe('items');
  });

  it('pluralises tsp/tbsp/cup/pack when count is not 1', () => {
    expect(pluralizeUnit(1, 'tsp')).toBe('tsp');
    expect(pluralizeUnit(2, 'tsp')).toBe('tsps');
    expect(pluralizeUnit(2, 'tbsp')).toBe('tbsps');
    expect(pluralizeUnit(2, 'cup')).toBe('cups');
    expect(pluralizeUnit(2, 'pack')).toBe('packs');
  });

  it('never pluralises weight/volume units', () => {
    expect(pluralizeUnit(2, 'g')).toBe('g');
    expect(pluralizeUnit(2, 'kg')).toBe('kg');
    expect(pluralizeUnit(2, 'ml')).toBe('ml');
    expect(pluralizeUnit(2, 'l')).toBe('l');
  });
});
