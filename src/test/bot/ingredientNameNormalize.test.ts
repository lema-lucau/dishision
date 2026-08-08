import { describe, expect, it } from 'vitest';
import { stripPrepDescriptors } from '../../bot/ingredientNameNormalize';

describe('stripPrepDescriptors (§B5 Layer 2)', () => {
  it('strips a comma-suffix prep descriptor', () => {
    expect(stripPrepDescriptors('chicken breast, diced')).toBe('chicken breast');
    expect(stripPrepDescriptors('Parmesan, grated')).toBe('Parmesan');
    expect(stripPrepDescriptors('spring onion, sliced')).toBe('spring onion');
    expect(stripPrepDescriptors('coriander, chopped, divided')).toBe('coriander');
  });

  it('strips a trailing serving phrase', () => {
    expect(stripPrepDescriptors('salt, to taste')).toBe('salt');
    expect(stripPrepDescriptors('parsley, for garnish')).toBe('parsley');
    expect(stripPrepDescriptors('butter, room temperature')).toBe('butter');
  });

  it('strips leading prep adjectives/adverbs', () => {
    expect(stripPrepDescriptors('finely chopped onion')).toBe('onion');
    expect(stripPrepDescriptors('freshly grated nutmeg')).toBe('nutmeg');
    expect(stripPrepDescriptors('thinly sliced garlic')).toBe('garlic');
  });

  it('handles both forms at once', () => {
    expect(stripPrepDescriptors('finely chopped onion, divided')).toBe('onion');
  });

  it('preserves varietal / form words — never collapses distinct ingredients', () => {
    expect(stripPrepDescriptors('smoked paprika')).toBe('smoked paprika');
    expect(stripPrepDescriptors('ground cumin')).toBe('ground cumin');
    expect(stripPrepDescriptors('dried oregano')).toBe('dried oregano');
    expect(stripPrepDescriptors('fresh basil')).toBe('fresh basil');
    // A comma tail that isn't purely prep is left alone.
    expect(stripPrepDescriptors('chicken thigh, skin on')).toBe('chicken thigh, skin on');
    // "fresh" survives even mid-strip.
    expect(stripPrepDescriptors('finely chopped fresh coriander')).toBe('fresh coriander');
  });

  it('never strips to empty, and trims', () => {
    expect(stripPrepDescriptors('  chopped  ')).toBe('chopped'); // last word never stripped
    expect(stripPrepDescriptors('')).toBe('');
    expect(stripPrepDescriptors('onion')).toBe('onion');
  });
});
