// Pantry section-grouping category (Pantry improvements: fine-grained
// sections — separate protein types, plus vegetable/fruit/dairy/staple).
// Best-effort keyword inference from the ingredient name, run at seed time
// (so existing installs get backfilled on every reseed) and offered as a
// starting suggestion in the "add ingredient" modal, which always lets the
// category be overridden by hand.
export type IngredientCategory =
  | 'beef'
  | 'chicken'
  | 'fish'
  | 'pork'
  | 'lamb'
  | 'vegetable'
  | 'fruit'
  | 'dairy'
  | 'staple'
  | 'other';

export const INGREDIENT_CATEGORIES: IngredientCategory[] = [
  'beef',
  'chicken',
  'fish',
  'pork',
  'lamb',
  'vegetable',
  'fruit',
  'dairy',
  'staple',
  'other',
];

export const INGREDIENT_CATEGORY_LABELS: Record<IngredientCategory, string> = {
  beef: 'Beef',
  chicken: 'Chicken',
  fish: 'Fish',
  pork: 'Pork',
  lamb: 'Lamb',
  vegetable: 'Vegetable',
  fruit: 'Fruit',
  dairy: 'Dairy & eggs',
  staple: 'Staples & pantry',
  other: 'Other',
};

// Ordered most-specific-first: a compound phrase like "black pepper" or
// "chicken stock cube" must resolve before the generic "pepper"/"chicken"
// match beneath it would grab it wrongly.
const RULES: Array<[IngredientCategory, RegExp]> = [
  // staple compounds that would otherwise collide with a protein/veg word
  ['staple', /stock cube|stock pot|bouillon/],
  ['staple', /black pepper|white pepper|peppercorn|cayenne|paprika|chilli (powder|flake)|spice|seasoning/],
  ['staple', /flour|sugar|rice|pasta|spaghetti|noodle|lasagne|couscous|oats?\b/],
  ['staple', /oil\b|vinegar|sauce|paste|puree|ketchup|mustard|mayonnaise|stock\b/],
  ['staple', /bread|tortilla|wrap\b|breadcrumb/],
  ['staple', /lentil|chickpea|bean(?!sprout)/],
  ['staple', /salt\b|herb|spice|bay leaf|oregano|thyme|rosemary|cumin|turmeric|cinnamon/],

  ['beef', /\bbeef\b|steak|brisket/],
  ['lamb', /\blamb\b/],
  ['pork', /\bpork\b|bacon|sausage|\bham\b|chorizo|pancetta/],
  ['chicken', /chicken|turkey/],
  ['fish', /fish|salmon|prawn|shrimp|\bcod\b|tuna|haddock|seafood|anchov|mackerel/],

  ['dairy', /cheese|\bmilk\b|cream\b|butter|yog(h)?urt|\begg/],

  ['fruit', /lemon|lime|apple|banana|mango|berry|orange|grape|peach|pear|melon|avocado|raisin|sultana/],

  ['vegetable', /onion|garlic|carrot|potato|pepper|tomato|courgette|cucumber|celery|leek|spinach|broccoli|cabbage|cauliflower|mushroom|\bpea\b|corn|aubergine|parsnip|lettuce|chilli|ginger|parsley|coriander|basil|beansprout|sweetcorn/],
];

export function inferIngredientCategory(name: string): IngredientCategory {
  const needle = name.toLowerCase();
  for (const [category, pattern] of RULES) {
    if (pattern.test(needle)) return category;
  }
  return 'other';
}
