import type { TagFixture } from '../types';

// Master tag definitions (§2.3 tag.type). Recipe fixtures reference tags by
// plain name string; the seed runner resolves against this list and falls
// back to a 'custom' tag for anything not listed here, so recipe authoring
// is never blocked on this file being exhaustive.
export const tags: TagFixture[] = [
  // protein
  { seedId: 'tag-chicken', name: 'chicken', type: 'protein', colour: '#E8A33D' },
  { seedId: 'tag-beef', name: 'beef', type: 'protein', colour: '#A33B2A' },
  { seedId: 'tag-pork', name: 'pork', type: 'protein', colour: '#D6837E' },
  { seedId: 'tag-fish', name: 'fish', type: 'protein', colour: '#4A8CA8' },
  { seedId: 'tag-lamb', name: 'lamb', type: 'protein', colour: '#8B4A5C' },
  { seedId: 'tag-veg', name: 'veg', type: 'protein', colour: '#5C8A3C' },

  // diet
  { seedId: 'tag-healthy', name: 'healthy', type: 'diet' },
  { seedId: 'tag-comfort', name: 'comfort', type: 'diet' },

  // meal — drives the collapsible Breakfast/Lunch/Dinner/Dessert sections
  { seedId: 'tag-breakfast', name: 'breakfast', type: 'meal' },
  { seedId: 'tag-lunch', name: 'lunch', type: 'meal' },
  { seedId: 'tag-dinner', name: 'dinner', type: 'meal' },
  { seedId: 'tag-dessert', name: 'dessert', type: 'meal' },

  // style
  { seedId: 'tag-thai', name: 'thai', type: 'style' },
  { seedId: 'tag-italian', name: 'italian', type: 'style' },
  { seedId: 'tag-indian', name: 'indian', type: 'style' },
  { seedId: 'tag-irish', name: 'irish', type: 'style' },
  { seedId: 'tag-mexican', name: 'mexican', type: 'style' },
  { seedId: 'tag-british', name: 'british', type: 'style' },
  { seedId: 'tag-asian', name: 'asian', type: 'style' },

  // equipment
  { seedId: 'tag-hob', name: 'hob', type: 'equipment' },
  { seedId: 'tag-oven', name: 'oven', type: 'equipment' },
  { seedId: 'tag-one-pot', name: 'one-pot', type: 'equipment' },
  { seedId: 'tag-traybake', name: 'traybake', type: 'equipment' },
];
