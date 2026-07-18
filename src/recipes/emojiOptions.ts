// Curated food-emoji set for the §5.5 emoji picker, each tagged with search
// keywords so the picker can filter by dish/ingredient name rather than
// forcing a scroll through an unrelated system emoji keyboard.
export interface EmojiOption {
  emoji: string;
  keywords: string[];
}

export const EMOJI_OPTIONS: EmojiOption[] = [
  { emoji: '🍝', keywords: ['pasta', 'spaghetti', 'bolognese', 'noodles'] },
  { emoji: '🍛', keywords: ['curry', 'katsu', 'rice'] },
  { emoji: '🍲', keywords: ['stew', 'pot', 'casserole'] },
  { emoji: '🍜', keywords: ['soup', 'ramen', 'noodles', 'pho'] },
  { emoji: '🥘', keywords: ['paella', 'coddle', 'skillet', 'one-pot'] },
  { emoji: '🍗', keywords: ['chicken', 'roast', 'poultry', 'drumstick'] },
  { emoji: '🐟', keywords: ['fish', 'pie', 'salmon'] },
  { emoji: '🍤', keywords: ['shrimp', 'prawn', 'chowder', 'seafood'] },
  { emoji: '🌮', keywords: ['taco', 'fajita', 'mexican'] },
  { emoji: '🌯', keywords: ['burrito', 'wrap'] },
  { emoji: '🥗', keywords: ['salad', 'veg', 'greens'] },
  { emoji: '🍳', keywords: ['egg', 'omelette', 'breakfast', 'fried egg'] },
  { emoji: '🥧', keywords: ['pie', 'shepherds pie', 'pastry'] },
  { emoji: '🥓', keywords: ['bacon', 'cabbage', 'pork'] },
  { emoji: '🌭', keywords: ['sausage', 'mash', 'hot dog'] },
  { emoji: '🍕', keywords: ['pizza'] },
  { emoji: '🍔', keywords: ['burger'] },
  { emoji: '🥙', keywords: ['pita', 'kebab', 'gyro'] },
  { emoji: '🍚', keywords: ['rice', 'bowl'] },
  { emoji: '🥩', keywords: ['steak', 'beef', 'meat'] },
  { emoji: '🍖', keywords: ['lamb', 'chop', 'meat on bone'] },
  { emoji: '🌶️', keywords: ['chilli', 'chili', 'spicy'] },
  { emoji: '🥡', keywords: ['stir fry', 'takeaway', 'noodle box'] },
  { emoji: '🍱', keywords: ['bento', 'lunch box'] },
  { emoji: '🥞', keywords: ['pancake', 'breakfast'] },
  { emoji: '🥪', keywords: ['sandwich'] },
  { emoji: '🥣', keywords: ['porridge', 'cereal', 'bowl'] },
  { emoji: '🍞', keywords: ['bread', 'loaf'] },
  { emoji: '🧀', keywords: ['cheese'] },
  { emoji: '🍰', keywords: ['cake', 'dessert'] },
  { emoji: '🍽️', keywords: ['plate', 'default', 'meal'] },
];

export function searchEmoji(query: string): EmojiOption[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return EMOJI_OPTIONS;
  return EMOJI_OPTIONS.filter((option) => option.keywords.some((k) => k.includes(needle)));
}
