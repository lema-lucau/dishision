import type { RecipeFixture } from '../types';

// Recipe fixture library (§9.2). Every `canonicalName` below must resolve to
// a `name` or `aliases` entry in ingredients.ts (case-insensitive, trimmed).
// `lanes` + per-step `lane`/`startOffsetSeconds` are only set for
// `timelineMode: 'parallel'` recipes; sequential recipes never set them.
export const recipes: RecipeFixture[] = [
  // -------------------------------------------------------------------
  // 1. Shepherd's Pie
  // -------------------------------------------------------------------
  {
    seedId: 'shepherds-pie',
    name: "Shepherd's Pie",
    description: 'Sunday comfort with a lamb mince base and buttery mash top.',
    photoEmoji: '🥧',
    baseServings: 4,
    timelineMode: 'sequential',
    tags: ['lamb', 'comfort', 'irish', 'oven'],
    ingredients: [
      { canonicalName: 'lamb mince', displayName: 'lamb mince', quantity: 500, unit: 'g' },
      { canonicalName: 'onion', displayName: 'onion, diced', quantity: 1, unit: 'unit' },
      { canonicalName: 'carrot', displayName: 'carrot, diced', quantity: 2, unit: 'unit' },
      { canonicalName: 'garlic', displayName: 'garlic, crushed', quantity: 2, unit: 'unit' },
      { canonicalName: 'tomato puree', displayName: 'tomato puree', quantity: 2, unit: 'tbsp' },
      { canonicalName: 'worcestershire sauce', displayName: 'worcestershire sauce', quantity: 1, unit: 'tbsp' },
      { canonicalName: 'beef stock cube', displayName: 'beef stock cube', quantity: 1, unit: 'unit', scalable: false },
      { canonicalName: 'water', displayName: 'water', quantity: 300, unit: 'ml' },
      { canonicalName: 'bay leaf', displayName: 'bay leaf', quantity: 1, unit: 'unit', scalable: false },
      { canonicalName: 'potato', displayName: 'potato, for mash', quantity: 800, unit: 'g' },
      { canonicalName: 'butter', displayName: 'butter', quantity: 40, unit: 'g' },
      { canonicalName: 'milk', displayName: 'milk', quantity: 100, unit: 'ml' },
      { canonicalName: 'frozen peas', displayName: 'frozen peas', quantity: 100, unit: 'g', optional: true },
      { canonicalName: 'salt', displayName: 'salt', quantity: 1, unit: 'tsp', scalable: false },
    ],
    steps: [
      { phase: 'prep', instruction: 'Peel and dice the potatoes for the mash.', effort: 'active' },
      { phase: 'prep', instruction: 'Peel and finely dice the onion and carrot; crush the garlic.', effort: 'active' },
      { phase: 'cook', instruction: 'Boil the potatoes in salted water until tender.', durationSeconds: 1080, effort: 'passive' },
      { phase: 'cook', instruction: 'Brown the lamb mince in a large pan over high heat.', durationSeconds: 480, effort: 'active' },
      { phase: 'cook', instruction: 'Add the onion, carrot and garlic; cook until softened.', durationSeconds: 360, effort: 'active' },
      { phase: 'cook', instruction: 'Stir in tomato puree, worcestershire sauce, stock cube, water and bay leaf; simmer.', durationSeconds: 1200, effort: 'passive' },
      { phase: 'cook', instruction: 'Stir in peas if using and simmer a few minutes more.', durationSeconds: 300, effort: 'passive' },
      { phase: 'cook', instruction: 'Drain the potatoes and mash with butter and milk.', durationSeconds: 300, effort: 'active' },
      { phase: 'cook', instruction: 'Spoon the mince into an ovenproof dish and top with the mash, forking the surface.', effort: 'active' },
      { phase: 'cook', instruction: 'Bake until the top is golden.', durationSeconds: 900, effort: 'passive', important: true },
    ],
  },

  // -------------------------------------------------------------------
  // 2. Cottage Pie
  // -------------------------------------------------------------------
  {
    seedId: 'cottage-pie',
    name: 'Cottage Pie',
    description: "Shepherd's pie's beefy cousin.",
    photoEmoji: '🍲',
    baseServings: 4,
    timelineMode: 'sequential',
    tags: ['beef', 'comfort', 'oven'],
    ingredients: [
      { canonicalName: 'beef mince', displayName: 'beef mince', quantity: 500, unit: 'g' },
      { canonicalName: 'onion', displayName: 'onion, diced', quantity: 1, unit: 'unit' },
      { canonicalName: 'carrot', displayName: 'carrot, diced', quantity: 2, unit: 'unit' },
      { canonicalName: 'celery', displayName: 'celery, diced', quantity: 1, unit: 'unit' },
      { canonicalName: 'garlic', displayName: 'garlic, crushed', quantity: 2, unit: 'unit' },
      { canonicalName: 'tomato puree', displayName: 'tomato puree', quantity: 2, unit: 'tbsp' },
      { canonicalName: 'beef stock cube', displayName: 'beef stock cube', quantity: 1, unit: 'unit', scalable: false },
      { canonicalName: 'water', displayName: 'water', quantity: 300, unit: 'ml' },
      { canonicalName: 'worcestershire sauce', displayName: 'worcestershire sauce', quantity: 1, unit: 'tbsp' },
      { canonicalName: 'potato', displayName: 'potato, for mash', quantity: 800, unit: 'g' },
      { canonicalName: 'butter', displayName: 'butter', quantity: 40, unit: 'g' },
      { canonicalName: 'milk', displayName: 'milk', quantity: 100, unit: 'ml' },
      { canonicalName: 'cheddar cheese', displayName: 'cheddar, grated, for the top', quantity: 50, unit: 'g', optional: true },
    ],
    steps: [
      { phase: 'prep', instruction: 'Peel and dice the potatoes.', effort: 'active' },
      { phase: 'prep', instruction: 'Dice the onion, carrot and celery; crush the garlic.', effort: 'active' },
      { phase: 'cook', instruction: 'Boil the potatoes until tender.', durationSeconds: 1080, effort: 'passive' },
      { phase: 'cook', instruction: 'Brown the beef mince in a large pan.', durationSeconds: 480, effort: 'active' },
      { phase: 'cook', instruction: 'Add the vegetables and cook until softened.', durationSeconds: 360, effort: 'active' },
      { phase: 'cook', instruction: 'Stir in tomato puree, stock cube, water and worcestershire sauce; simmer.', durationSeconds: 1200, effort: 'passive' },
      { phase: 'cook', instruction: 'Drain and mash the potatoes with butter and milk.', durationSeconds: 300, effort: 'active' },
      { phase: 'cook', instruction: 'Top the mince with mash and cheese if using.', effort: 'active' },
      { phase: 'cook', instruction: 'Bake until golden and bubbling.', durationSeconds: 900, effort: 'passive', important: true },
    ],
  },

  // -------------------------------------------------------------------
  // 3. Bacon & Cabbage
  // -------------------------------------------------------------------
  {
    seedId: 'bacon-and-cabbage',
    name: 'Bacon & Cabbage',
    description: 'Classic Irish boiled bacon with cabbage and parsley sauce.',
    photoEmoji: '🥬',
    baseServings: 4,
    timelineMode: 'sequential',
    originLabel: "Nana's recipe",
    tags: ['pork', 'irish', 'comfort', 'one-pot'],
    ingredients: [
      { canonicalName: 'bacon joint', displayName: 'bacon joint', quantity: 800, unit: 'g' },
      { canonicalName: 'cabbage', displayName: 'cabbage, shredded', quantity: 500, unit: 'g' },
      { canonicalName: 'carrot', displayName: 'carrot', quantity: 2, unit: 'unit' },
      { canonicalName: 'potato', displayName: 'potato', quantity: 600, unit: 'g' },
      { canonicalName: 'bay leaf', displayName: 'bay leaf', quantity: 2, unit: 'unit', scalable: false },
      { canonicalName: 'butter', displayName: 'butter', quantity: 30, unit: 'g' },
      { canonicalName: 'plain flour', displayName: 'plain flour', quantity: 20, unit: 'g' },
      { canonicalName: 'milk', displayName: 'milk', quantity: 250, unit: 'ml' },
      { canonicalName: 'fresh parsley', displayName: 'parsley, chopped', quantity: 15, unit: 'g' },
    ],
    steps: [
      { phase: 'prep', instruction: 'Peel the carrots and potatoes; shred the cabbage.', effort: 'active' },
      { phase: 'cook', instruction: 'Cover the bacon joint with cold water, add bay leaves and bring to the boil.', durationSeconds: 600, effort: 'active' },
      { phase: 'cook', instruction: 'Simmer the bacon gently, skimming as needed.', durationSeconds: 3600, effort: 'passive' },
      { phase: 'cook', instruction: 'Add the carrots and potatoes to the pot for the last 20 minutes.', durationSeconds: 1200, effort: 'passive' },
      { phase: 'cook', instruction: 'Steam or boil the cabbage separately until just tender.', durationSeconds: 600, effort: 'passive' },
      { phase: 'cook', instruction: 'Melt the butter in a small pan, whisk in flour, then gradually add milk to make a parsley sauce.', durationSeconds: 480, effort: 'active' },
      { phase: 'cook', instruction: 'Stir the chopped parsley into the sauce.', durationSeconds: 60, effort: 'active' },
      { phase: 'cook', instruction: 'Slice the bacon and serve with cabbage, potatoes and parsley sauce.', effort: 'active' },
    ],
  },

  // -------------------------------------------------------------------
  // 4. Beef Stew
  // -------------------------------------------------------------------
  {
    seedId: 'beef-stew',
    name: 'Beef Stew',
    description: 'Slow and rich, better the next day.',
    photoEmoji: '🍖',
    baseServings: 4,
    timelineMode: 'sequential',
    tags: ['beef', 'comfort', 'one-pot'],
    ingredients: [
      { canonicalName: 'beef stewing steak', displayName: 'beef stewing steak, diced', quantity: 600, unit: 'g' },
      { canonicalName: 'plain flour', displayName: 'plain flour, for dusting', quantity: 20, unit: 'g' },
      { canonicalName: 'vegetable oil', displayName: 'vegetable oil', quantity: 2, unit: 'tbsp', scalable: false },
      { canonicalName: 'onion', displayName: 'onion, sliced', quantity: 2, unit: 'unit' },
      { canonicalName: 'carrot', displayName: 'carrot, chunked', quantity: 3, unit: 'unit' },
      { canonicalName: 'celery', displayName: 'celery, chunked', quantity: 2, unit: 'unit' },
      { canonicalName: 'potato', displayName: 'potato, chunked', quantity: 400, unit: 'g' },
      { canonicalName: 'beef stock cube', displayName: 'beef stock cube', quantity: 2, unit: 'unit', scalable: false },
      { canonicalName: 'water', displayName: 'water', quantity: 700, unit: 'ml' },
      { canonicalName: 'bay leaf', displayName: 'bay leaf', quantity: 2, unit: 'unit', scalable: false },
      { canonicalName: 'fresh thyme', displayName: 'thyme', quantity: 3, unit: 'g' },
      { canonicalName: 'worcestershire sauce', displayName: 'worcestershire sauce', quantity: 1, unit: 'tbsp' },
    ],
    steps: [
      { phase: 'prep', instruction: 'Toss the beef in seasoned flour.', effort: 'active' },
      { phase: 'prep', instruction: 'Chop the onion, carrot, celery and potato.', effort: 'active' },
      { phase: 'cook', instruction: 'Brown the beef in batches in hot oil, then set aside.', durationSeconds: 600, effort: 'active' },
      { phase: 'cook', instruction: 'Soften the onion in the same pot.', durationSeconds: 300, effort: 'active' },
      { phase: 'cook', instruction: 'Return the beef to the pot with carrot, celery, stock, bay leaves, thyme and worcestershire sauce.', durationSeconds: 120, effort: 'active' },
      { phase: 'cook', instruction: 'Cover and simmer low until the beef is tender.', durationSeconds: 7200, effort: 'passive' },
      { phase: 'cook', instruction: 'Add the potato and simmer until cooked through.', durationSeconds: 1200, effort: 'passive' },
      { phase: 'cook', instruction: 'Taste and adjust seasoning before serving.', effort: 'active' },
    ],
  },

  // -------------------------------------------------------------------
  // 5. Chicken Curry (parallel: curry + rice)
  // -------------------------------------------------------------------
  {
    seedId: 'chicken-curry',
    name: 'Chicken Curry',
    description: 'Midweek curry-house-style chicken curry.',
    photoEmoji: '🍛',
    baseServings: 4,
    timelineMode: 'parallel',
    lanes: ['curry', 'rice'],
    tags: ['chicken', 'indian', 'hob'],
    ingredients: [
      { canonicalName: 'chicken thigh', displayName: 'chicken thigh, diced', quantity: 600, unit: 'g' },
      { canonicalName: 'onion', displayName: 'onion, sliced', quantity: 2, unit: 'unit' },
      { canonicalName: 'garlic', displayName: 'garlic, crushed', quantity: 3, unit: 'unit' },
      { canonicalName: 'ginger', displayName: 'ginger, grated', quantity: 15, unit: 'g' },
      { canonicalName: 'curry powder', displayName: 'curry powder', quantity: 2, unit: 'tbsp' },
      { canonicalName: 'ground turmeric', displayName: 'turmeric', quantity: 1, unit: 'tsp' },
      { canonicalName: 'chopped tomatoes', displayName: 'chopped tomatoes', quantity: 400, unit: 'g' },
      { canonicalName: 'coconut milk', displayName: 'coconut milk', quantity: 200, unit: 'ml' },
      { canonicalName: 'chicken stock cube', displayName: 'chicken stock cube', quantity: 1, unit: 'unit', scalable: false },
      { canonicalName: 'water', displayName: 'water', quantity: 150, unit: 'ml' },
      { canonicalName: 'basmati rice', displayName: 'basmati rice', quantity: 300, unit: 'g' },
      { canonicalName: 'fresh coriander', displayName: 'coriander, to serve', quantity: 10, unit: 'g', optional: true },
      { canonicalName: 'vegetable oil', displayName: 'vegetable oil', quantity: 1, unit: 'tbsp', scalable: false },
    ],
    steps: [
      { lane: 'curry', phase: 'prep', instruction: 'Slice the onion, crush the garlic and grate the ginger.', effort: 'active', startOffsetSeconds: 0 },
      { lane: 'curry', phase: 'cook', instruction: 'Soften the onion in oil, then add garlic and ginger.', durationSeconds: 300, effort: 'active', startOffsetSeconds: 180 },
      { lane: 'curry', phase: 'cook', instruction: 'Add the chicken and brown lightly.', durationSeconds: 360, effort: 'active', startOffsetSeconds: 480 },
      { lane: 'curry', phase: 'cook', instruction: 'Stir in curry powder and turmeric, cook for a minute.', durationSeconds: 60, effort: 'active', startOffsetSeconds: 840 },
      { lane: 'curry', phase: 'cook', instruction: 'Add tomatoes, coconut milk, stock cube and water; simmer.', durationSeconds: 1500, effort: 'passive', startOffsetSeconds: 900 },
      { lane: 'curry', phase: 'cook', instruction: 'Scatter coriander over before serving.', effort: 'active', startOffsetSeconds: 2400 },
      { lane: 'rice', phase: 'prep', instruction: 'Rinse the rice until the water runs clear.', effort: 'active', startOffsetSeconds: 900 },
      { lane: 'rice', phase: 'cook', instruction: 'Simmer the rice in salted water until tender, then rest covered.', durationSeconds: 900, effort: 'passive', startOffsetSeconds: 1500 },
    ],
  },

  // -------------------------------------------------------------------
  // 6. Chicken Katsu Curry (parallel)
  // -------------------------------------------------------------------
  {
    seedId: 'chicken-katsu-curry',
    name: 'Chicken Katsu Curry',
    description: 'Crumbed chicken with a sweet, mild Japanese-style curry sauce.',
    photoEmoji: '🍱',
    baseServings: 4,
    timelineMode: 'parallel',
    lanes: ['chicken', 'sauce', 'rice'],
    tags: ['chicken', 'asian', 'hob'],
    ingredients: [
      { canonicalName: 'chicken breast', displayName: 'chicken breast, flattened', quantity: 4, unit: 'unit' },
      { canonicalName: 'plain flour', displayName: 'plain flour, for coating', quantity: 60, unit: 'g' },
      { canonicalName: 'eggs', displayName: 'egg, beaten', quantity: 1, unit: 'unit' },
      { canonicalName: 'panko breadcrumbs', displayName: 'panko breadcrumbs', quantity: 120, unit: 'g' },
      { canonicalName: 'vegetable oil', displayName: 'vegetable oil, for frying', quantity: 4, unit: 'tbsp', scalable: false },
      { canonicalName: 'onion', displayName: 'onion, sliced', quantity: 1, unit: 'unit' },
      { canonicalName: 'garlic', displayName: 'garlic, crushed', quantity: 2, unit: 'unit' },
      { canonicalName: 'ginger', displayName: 'ginger, grated', quantity: 10, unit: 'g' },
      { canonicalName: 'curry powder', displayName: 'curry powder', quantity: 1, unit: 'tbsp' },
      { canonicalName: 'honey', displayName: 'honey', quantity: 1, unit: 'tbsp' },
      { canonicalName: 'soy sauce', displayName: 'soy sauce', quantity: 1, unit: 'tbsp' },
      { canonicalName: 'chicken stock cube', displayName: 'chicken stock cube', quantity: 1, unit: 'unit', scalable: false },
      { canonicalName: 'water', displayName: 'water', quantity: 300, unit: 'ml' },
      { canonicalName: 'carrot', displayName: 'carrot, grated', quantity: 1, unit: 'unit' },
      { canonicalName: 'basmati rice', displayName: 'basmati rice', quantity: 300, unit: 'g' },
    ],
    steps: [
      { lane: 'chicken', phase: 'prep', instruction: 'Flatten the chicken breasts to an even thickness.', effort: 'active', startOffsetSeconds: 0 },
      { lane: 'chicken', phase: 'prep', instruction: 'Set up flour, beaten egg and panko in three dishes and coat the chicken.', effort: 'active', startOffsetSeconds: 300 },
      { lane: 'chicken', phase: 'cook', instruction: 'Shallow fry the chicken until golden and cooked through.', durationSeconds: 600, effort: 'active', startOffsetSeconds: 900, important: true },
      { lane: 'chicken', phase: 'cook', instruction: 'Rest the chicken briefly, then slice.', durationSeconds: 180, effort: 'passive', startOffsetSeconds: 1500 },
      { lane: 'sauce', phase: 'prep', instruction: 'Slice the onion, crush the garlic and grate the ginger and carrot.', effort: 'active', startOffsetSeconds: 0 },
      { lane: 'sauce', phase: 'cook', instruction: 'Soften the onion, garlic, ginger and carrot in a pan.', durationSeconds: 360, effort: 'active', startOffsetSeconds: 300 },
      { lane: 'sauce', phase: 'cook', instruction: 'Stir in curry powder, honey, soy sauce, stock cube and water; simmer until thickened.', durationSeconds: 900, effort: 'passive', startOffsetSeconds: 660 },
      { lane: 'rice', phase: 'prep', instruction: 'Rinse the rice.', effort: 'active', startOffsetSeconds: 600 },
      { lane: 'rice', phase: 'cook', instruction: 'Cook the rice until tender and rest covered.', durationSeconds: 900, effort: 'passive', startOffsetSeconds: 900 },
    ],
  },

  // -------------------------------------------------------------------
  // 7. Spaghetti Bolognese
  // -------------------------------------------------------------------
  {
    seedId: 'spaghetti-bolognese',
    name: 'Spaghetti Bolognese',
    description: 'Weeknight staple.',
    photoEmoji: '🍝',
    baseServings: 4,
    timelineMode: 'sequential',
    tags: ['beef', 'italian', 'comfort'],
    ingredients: [
      { canonicalName: 'beef mince', displayName: 'beef mince', quantity: 500, unit: 'g' },
      { canonicalName: 'onion', displayName: 'onion, diced', quantity: 1, unit: 'unit' },
      { canonicalName: 'carrot', displayName: 'carrot, diced', quantity: 1, unit: 'unit' },
      { canonicalName: 'celery', displayName: 'celery, diced', quantity: 1, unit: 'unit' },
      { canonicalName: 'garlic', displayName: 'garlic, crushed', quantity: 2, unit: 'unit' },
      { canonicalName: 'chopped tomatoes', displayName: 'chopped tomatoes', quantity: 800, unit: 'g' },
      { canonicalName: 'tomato puree', displayName: 'tomato puree', quantity: 1, unit: 'tbsp' },
      { canonicalName: 'dried oregano', displayName: 'dried oregano', quantity: 1, unit: 'tsp', scalable: false },
      { canonicalName: 'red wine', displayName: 'red wine', quantity: 100, unit: 'ml', optional: true },
      { canonicalName: 'spaghetti', displayName: 'spaghetti', quantity: 400, unit: 'g' },
      { canonicalName: 'parmesan', displayName: 'parmesan, to serve', quantity: 40, unit: 'g', optional: true },
    ],
    steps: [
      { phase: 'prep', instruction: 'Dice the onion, carrot and celery; crush the garlic.', effort: 'active' },
      { phase: 'cook', instruction: 'Brown the beef mince in a large pan.', durationSeconds: 480, effort: 'active' },
      { phase: 'cook', instruction: 'Add the vegetables and cook until softened.', durationSeconds: 420, effort: 'active' },
      { phase: 'cook', instruction: 'Stir in tomatoes, puree, oregano and wine if using; bring to a simmer.', durationSeconds: 120, effort: 'active' },
      { phase: 'cook', instruction: 'Simmer the sauce low, stirring occasionally.', durationSeconds: 2700, effort: 'passive' },
      { phase: 'cook', instruction: 'Cook the spaghetti in salted boiling water until al dente.', durationSeconds: 600, effort: 'passive' },
      { phase: 'cook', instruction: 'Toss the drained pasta through the sauce and serve with parmesan.', durationSeconds: 60, effort: 'active' },
    ],
  },

  // -------------------------------------------------------------------
  // 8. Roast Chicken (parallel)
  // -------------------------------------------------------------------
  {
    seedId: 'roast-chicken',
    name: 'Roast Chicken',
    description: 'Sunday roast, minimal fuss.',
    photoEmoji: '🍗',
    baseServings: 4,
    timelineMode: 'parallel',
    lanes: ['chicken', 'veg', 'gravy'],
    tags: ['chicken', 'irish', 'oven', 'comfort'],
    ingredients: [
      { canonicalName: 'whole chicken', displayName: 'whole chicken', quantity: 1500, unit: 'g' },
      { canonicalName: 'butter', displayName: 'butter, softened', quantity: 30, unit: 'g' },
      { canonicalName: 'fresh rosemary', displayName: 'rosemary', quantity: 5, unit: 'g', scalable: false },
      { canonicalName: 'lemon', displayName: 'lemon, halved', quantity: 1, unit: 'unit' },
      { canonicalName: 'potato', displayName: 'potato, quartered', quantity: 800, unit: 'g' },
      { canonicalName: 'carrot', displayName: 'carrot', quantity: 4, unit: 'unit' },
      { canonicalName: 'parsnip', displayName: 'parsnip', quantity: 2, unit: 'unit' },
      { canonicalName: 'olive oil', displayName: 'olive oil', quantity: 2, unit: 'tbsp', scalable: false },
      { canonicalName: 'frozen peas', displayName: 'frozen peas', quantity: 150, unit: 'g' },
      { canonicalName: 'plain flour', displayName: 'plain flour', quantity: 20, unit: 'g' },
      { canonicalName: 'chicken stock cube', displayName: 'chicken stock cube', quantity: 1, unit: 'unit', scalable: false },
      { canonicalName: 'water', displayName: 'water', quantity: 300, unit: 'ml' },
    ],
    steps: [
      { lane: 'chicken', phase: 'prep', instruction: 'Rub the chicken with butter and rosemary and stuff with the lemon halves.', effort: 'active', startOffsetSeconds: 0 },
      { lane: 'chicken', phase: 'cook', instruction: 'Roast the chicken until the juices run clear.', durationSeconds: 5400, effort: 'passive', startOffsetSeconds: 300, important: true },
      { lane: 'chicken', phase: 'cook', instruction: 'Rest the chicken, tented in foil, before carving.', durationSeconds: 900, effort: 'passive', startOffsetSeconds: 5700 },
      { lane: 'veg', phase: 'prep', instruction: 'Peel and chunk the potatoes, carrots and parsnips.', effort: 'active', startOffsetSeconds: 0 },
      { lane: 'veg', phase: 'cook', instruction: 'Toss the vegetables in oil and roast alongside the chicken.', durationSeconds: 4800, effort: 'passive', startOffsetSeconds: 900 },
      { lane: 'veg', phase: 'cook', instruction: 'Boil the peas for the last few minutes.', durationSeconds: 300, effort: 'passive', startOffsetSeconds: 5400 },
      { lane: 'gravy', phase: 'cook', instruction: 'Whisk flour into the resting pan juices over heat.', durationSeconds: 120, effort: 'active', startOffsetSeconds: 5700 },
      { lane: 'gravy', phase: 'cook', instruction: 'Add stock cube and water, simmer to a gravy.', durationSeconds: 480, effort: 'passive', startOffsetSeconds: 5820 },
    ],
  },

  // -------------------------------------------------------------------
  // 9. Fish Pie
  // -------------------------------------------------------------------
  {
    seedId: 'fish-pie',
    name: 'Fish Pie',
    description: 'Creamy fish under a mash blanket.',
    photoEmoji: '🐟',
    baseServings: 4,
    timelineMode: 'sequential',
    tags: ['fish', 'comfort', 'oven'],
    ingredients: [
      { canonicalName: 'smoked haddock', displayName: 'smoked haddock', quantity: 250, unit: 'g' },
      { canonicalName: 'white fish fillet', displayName: 'white fish fillet', quantity: 250, unit: 'g' },
      { canonicalName: 'prawns', displayName: 'prawns', quantity: 150, unit: 'g', optional: true },
      { canonicalName: 'milk', displayName: 'milk', quantity: 400, unit: 'ml' },
      { canonicalName: 'bay leaf', displayName: 'bay leaf', quantity: 1, unit: 'unit', scalable: false },
      { canonicalName: 'butter', displayName: 'butter', quantity: 50, unit: 'g' },
      { canonicalName: 'plain flour', displayName: 'plain flour', quantity: 40, unit: 'g' },
      { canonicalName: 'cheddar cheese', displayName: 'cheddar, grated', quantity: 60, unit: 'g' },
      { canonicalName: 'fresh parsley', displayName: 'parsley, chopped', quantity: 10, unit: 'g' },
      { canonicalName: 'frozen peas', displayName: 'frozen peas', quantity: 100, unit: 'g' },
      { canonicalName: 'potato', displayName: 'potato, for mash', quantity: 800, unit: 'g' },
      { canonicalName: 'eggs', displayName: 'egg, boiled and sliced', quantity: 2, unit: 'unit', optional: true },
    ],
    steps: [
      { phase: 'prep', instruction: 'Peel and chop the potatoes for mash.', effort: 'active' },
      { phase: 'cook', instruction: 'Poach the fish gently in milk with the bay leaf.', durationSeconds: 600, effort: 'passive' },
      { phase: 'cook', instruction: 'Boil the potatoes until tender.', durationSeconds: 1080, effort: 'passive' },
      { phase: 'cook', instruction: 'Lift out the fish, flake it, and reserve the poaching milk.', durationSeconds: 300, effort: 'active' },
      { phase: 'cook', instruction: 'Melt butter, whisk in flour, then gradually add the reserved milk to make a sauce.', durationSeconds: 480, effort: 'active' },
      { phase: 'cook', instruction: 'Stir the cheddar and parsley through the sauce until melted.', durationSeconds: 120, effort: 'active' },
      { phase: 'cook', instruction: 'Layer the fish, prawns, peas, egg and sauce in a dish.', effort: 'active' },
      { phase: 'cook', instruction: 'Mash the potatoes and spread over the top.', durationSeconds: 300, effort: 'active' },
      { phase: 'cook', instruction: 'Bake until golden and bubbling at the edges.', durationSeconds: 1500, effort: 'passive', important: true },
    ],
  },

  // -------------------------------------------------------------------
  // 10. Carbonara
  // -------------------------------------------------------------------
  {
    seedId: 'carbonara',
    name: 'Carbonara',
    description: 'Silky egg and pancetta pasta, no cream needed.',
    photoEmoji: '🍝',
    baseServings: 2,
    timelineMode: 'sequential',
    tags: ['pork', 'italian'],
    ingredients: [
      { canonicalName: 'spaghetti', displayName: 'spaghetti', quantity: 200, unit: 'g' },
      { canonicalName: 'streaky bacon', displayName: 'pancetta, diced', quantity: 6, unit: 'unit' },
      { canonicalName: 'eggs', displayName: 'egg', quantity: 3, unit: 'unit' },
      { canonicalName: 'parmesan', displayName: 'parmesan, grated', quantity: 60, unit: 'g' },
      { canonicalName: 'black pepper', displayName: 'black pepper, plenty', quantity: 2, unit: 'tsp', scalable: false },
      { canonicalName: 'garlic', displayName: 'garlic, crushed', quantity: 1, unit: 'unit', optional: true },
    ],
    steps: [
      { phase: 'prep', instruction: 'Whisk the eggs and parmesan together in a bowl.', effort: 'active' },
      { phase: 'cook', instruction: 'Cook the spaghetti in salted boiling water until al dente.', durationSeconds: 600, effort: 'passive' },
      { phase: 'cook', instruction: 'Fry the pancetta until crisp, adding garlic for the last minute if using.', durationSeconds: 360, effort: 'active' },
      { phase: 'cook', instruction: 'Off the heat, toss the drained pasta with the pancetta and a splash of pasta water.', durationSeconds: 60, effort: 'active' },
      { phase: 'cook', instruction: 'Quickly stir through the egg mixture off the heat until glossy and silky.', durationSeconds: 90, effort: 'active', important: true },
      { phase: 'cook', instruction: 'Finish with black pepper and rest a moment before serving.', durationSeconds: 60, effort: 'passive' },
    ],
  },

  // -------------------------------------------------------------------
  // 11. Chilli Con Carne
  // -------------------------------------------------------------------
  {
    seedId: 'chilli-con-carne',
    name: 'Chilli Con Carne',
    description: 'One-pot chilli, freezer-friendly.',
    photoEmoji: '🌶️',
    baseServings: 4,
    timelineMode: 'sequential',
    tags: ['beef', 'mexican', 'one-pot'],
    ingredients: [
      { canonicalName: 'beef mince', displayName: 'beef mince', quantity: 500, unit: 'g' },
      { canonicalName: 'onion', displayName: 'onion, diced', quantity: 1, unit: 'unit' },
      { canonicalName: 'garlic', displayName: 'garlic, crushed', quantity: 2, unit: 'unit' },
      { canonicalName: 'red pepper', displayName: 'red pepper, diced', quantity: 1, unit: 'unit' },
      { canonicalName: 'chilli powder', displayName: 'chilli powder', quantity: 2, unit: 'tsp' },
      { canonicalName: 'ground cumin', displayName: 'ground cumin', quantity: 1, unit: 'tsp' },
      { canonicalName: 'chopped tomatoes', displayName: 'chopped tomatoes', quantity: 800, unit: 'g' },
      { canonicalName: 'kidney beans', displayName: 'kidney beans, drained', quantity: 400, unit: 'g' },
      { canonicalName: 'beef stock cube', displayName: 'beef stock cube', quantity: 1, unit: 'unit', scalable: false },
      { canonicalName: 'basmati rice', displayName: 'basmati rice, to serve', quantity: 300, unit: 'g' },
      { canonicalName: 'soured cream', displayName: 'soured cream, to serve', quantity: 60, unit: 'g', optional: true },
      { canonicalName: 'green chilli', displayName: 'green chilli, sliced, extra heat', quantity: 1, unit: 'unit', optional: true },
    ],
    steps: [
      { phase: 'prep', instruction: 'Dice the onion, garlic and red pepper.', effort: 'active' },
      { phase: 'cook', instruction: 'Brown the beef mince in a large pot.', durationSeconds: 480, effort: 'active' },
      { phase: 'cook', instruction: 'Add the onion, garlic and pepper, cook until softened.', durationSeconds: 360, effort: 'active' },
      { phase: 'cook', instruction: 'Stir in chilli powder and cumin, cook briefly.', durationSeconds: 60, effort: 'active' },
      { phase: 'cook', instruction: 'Add tomatoes, kidney beans and crumbled stock cube; simmer low.', durationSeconds: 2700, effort: 'passive' },
      { phase: 'cook', instruction: 'Cook the rice in salted boiling water until tender.', durationSeconds: 900, effort: 'passive' },
      { phase: 'cook', instruction: 'Serve the chilli over rice with soured cream and green chilli if using.', effort: 'active' },
    ],
  },

  // -------------------------------------------------------------------
  // 12. Chicken Stir Fry (parallel)
  // -------------------------------------------------------------------
  {
    seedId: 'chicken-stir-fry',
    name: 'Chicken Stir Fry',
    description: 'Fast, healthy, and endlessly adaptable.',
    photoEmoji: '🥡',
    baseServings: 2,
    timelineMode: 'parallel',
    lanes: ['rice', 'chicken', 'sauce'],
    tags: ['chicken', 'healthy', 'hob', 'asian'],
    ingredients: [
      { canonicalName: 'jasmine rice', displayName: 'jasmine rice', quantity: 180, unit: 'g' },
      { canonicalName: 'chicken breast', displayName: 'chicken breast, sliced', quantity: 350, unit: 'g' },
      { canonicalName: 'red pepper', displayName: 'red pepper, sliced', quantity: 1, unit: 'unit' },
      { canonicalName: 'broccoli', displayName: 'broccoli, small florets', quantity: 150, unit: 'g' },
      { canonicalName: 'carrot', displayName: 'carrot, julienned', quantity: 1, unit: 'unit' },
      { canonicalName: 'spring onion', displayName: 'spring onion, sliced', quantity: 3, unit: 'unit' },
      { canonicalName: 'garlic', displayName: 'garlic, crushed', quantity: 2, unit: 'unit' },
      { canonicalName: 'ginger', displayName: 'ginger, grated', quantity: 10, unit: 'g' },
      { canonicalName: 'soy sauce', displayName: 'soy sauce', quantity: 2, unit: 'tbsp' },
      { canonicalName: 'sesame oil', displayName: 'sesame oil', quantity: 1, unit: 'tsp' },
      { canonicalName: 'cornflour', displayName: 'cornflour', quantity: 1, unit: 'tsp' },
      { canonicalName: 'vegetable oil', displayName: 'vegetable oil', quantity: 1, unit: 'tbsp', scalable: false },
    ],
    steps: [
      { lane: 'rice', phase: 'prep', instruction: 'Rinse the rice.', effort: 'active', startOffsetSeconds: 0 },
      { lane: 'rice', phase: 'cook', instruction: 'Cook the rice until tender and rest covered.', durationSeconds: 720, effort: 'passive', startOffsetSeconds: 60 },
      { lane: 'chicken', phase: 'prep', instruction: 'Slice the chicken, vegetables and spring onion.', effort: 'active', startOffsetSeconds: 0 },
      { lane: 'chicken', phase: 'cook', instruction: 'Stir-fry the chicken in hot oil until cooked through.', durationSeconds: 360, effort: 'active', startOffsetSeconds: 300 },
      { lane: 'chicken', phase: 'cook', instruction: 'Add the vegetables and stir-fry until just tender.', durationSeconds: 240, effort: 'active', startOffsetSeconds: 660 },
      { lane: 'sauce', phase: 'prep', instruction: 'Mix soy sauce, sesame oil and cornflour with a splash of water.', effort: 'active', startOffsetSeconds: 300 },
      { lane: 'sauce', phase: 'cook', instruction: 'Pour the sauce into the pan and toss until glossy.', durationSeconds: 120, effort: 'active', startOffsetSeconds: 900 },
    ],
  },

  // -------------------------------------------------------------------
  // 13. Beef Stir Fry (parallel)
  // -------------------------------------------------------------------
  {
    seedId: 'beef-stir-fry',
    name: 'Beef Stir Fry',
    description: 'Quick seared beef with crunchy veg.',
    photoEmoji: '🥢',
    baseServings: 2,
    timelineMode: 'parallel',
    lanes: ['rice', 'beef', 'sauce'],
    tags: ['beef', 'hob', 'asian'],
    ingredients: [
      { canonicalName: 'jasmine rice', displayName: 'jasmine rice', quantity: 180, unit: 'g' },
      { canonicalName: 'beef frying steak', displayName: 'beef frying steak, thin strips', quantity: 350, unit: 'g' },
      { canonicalName: 'sugar snap peas', displayName: 'sugar snap peas', quantity: 120, unit: 'g' },
      { canonicalName: 'red pepper', displayName: 'red pepper, sliced', quantity: 1, unit: 'unit' },
      { canonicalName: 'spring onion', displayName: 'spring onion, sliced', quantity: 3, unit: 'unit' },
      { canonicalName: 'garlic', displayName: 'garlic, crushed', quantity: 2, unit: 'unit' },
      { canonicalName: 'ginger', displayName: 'ginger, grated', quantity: 10, unit: 'g' },
      { canonicalName: 'oyster sauce', displayName: 'oyster sauce', quantity: 2, unit: 'tbsp' },
      { canonicalName: 'soy sauce', displayName: 'soy sauce', quantity: 1, unit: 'tbsp' },
      { canonicalName: 'vegetable oil', displayName: 'vegetable oil', quantity: 1, unit: 'tbsp', scalable: false },
    ],
    steps: [
      { lane: 'rice', phase: 'prep', instruction: 'Rinse the rice.', effort: 'active', startOffsetSeconds: 0 },
      { lane: 'rice', phase: 'cook', instruction: 'Cook the rice until tender and rest covered.', durationSeconds: 720, effort: 'passive', startOffsetSeconds: 60 },
      { lane: 'beef', phase: 'prep', instruction: 'Slice the beef thinly against the grain.', effort: 'active', startOffsetSeconds: 0 },
      { lane: 'beef', phase: 'cook', instruction: 'Sear the beef in a very hot pan in batches.', durationSeconds: 240, effort: 'active', startOffsetSeconds: 300, important: true },
      { lane: 'beef', phase: 'cook', instruction: 'Add the sugar snap peas, pepper, garlic and ginger; stir-fry briefly.', durationSeconds: 240, effort: 'active', startOffsetSeconds: 540 },
      { lane: 'sauce', phase: 'cook', instruction: 'Stir in oyster sauce and soy sauce, toss to coat.', durationSeconds: 90, effort: 'active', startOffsetSeconds: 780 },
      { lane: 'sauce', phase: 'cook', instruction: 'Scatter spring onion over before serving.', effort: 'active', startOffsetSeconds: 870 },
    ],
  },

  // -------------------------------------------------------------------
  // 14. Chicken Fajitas (parallel)
  // -------------------------------------------------------------------
  {
    seedId: 'chicken-fajitas',
    name: 'Chicken Fajitas',
    description: 'Sizzling chicken and peppers, build your own wrap.',
    photoEmoji: '🌯',
    baseServings: 4,
    timelineMode: 'parallel',
    lanes: ['chicken', 'toppings'],
    tags: ['chicken', 'mexican', 'hob'],
    ingredients: [
      { canonicalName: 'chicken breast', displayName: 'chicken breast, sliced', quantity: 500, unit: 'g' },
      { canonicalName: 'red pepper', displayName: 'red pepper, sliced', quantity: 1, unit: 'unit' },
      { canonicalName: 'green pepper', displayName: 'green pepper, sliced', quantity: 1, unit: 'unit' },
      { canonicalName: 'red onion', displayName: 'red onion, sliced', quantity: 1, unit: 'unit' },
      { canonicalName: 'smoked paprika', displayName: 'smoked paprika', quantity: 2, unit: 'tsp' },
      { canonicalName: 'ground cumin', displayName: 'ground cumin', quantity: 1, unit: 'tsp' },
      { canonicalName: 'chilli powder', displayName: 'chilli powder', quantity: 1, unit: 'tsp', optional: true },
      { canonicalName: 'lime', displayName: 'lime', quantity: 1, unit: 'unit' },
      { canonicalName: 'olive oil', displayName: 'olive oil', quantity: 2, unit: 'tbsp', scalable: false },
      { canonicalName: 'tortilla wrap', displayName: 'tortilla wrap', quantity: 8, unit: 'unit' },
      { canonicalName: 'soured cream', displayName: 'soured cream', quantity: 100, unit: 'g' },
      { canonicalName: 'cheddar cheese', displayName: 'cheddar, grated', quantity: 80, unit: 'g' },
      { canonicalName: 'avocado', displayName: 'avocado, sliced', quantity: 1, unit: 'unit', optional: true },
    ],
    steps: [
      { lane: 'chicken', phase: 'prep', instruction: 'Slice the chicken, peppers and onion.', effort: 'active', startOffsetSeconds: 0 },
      { lane: 'chicken', phase: 'prep', instruction: 'Toss the chicken with the spices, oil and a squeeze of lime.', effort: 'active', startOffsetSeconds: 300 },
      { lane: 'chicken', phase: 'cook', instruction: 'Fry the chicken over high heat until starting to colour.', durationSeconds: 360, effort: 'active', startOffsetSeconds: 480 },
      { lane: 'chicken', phase: 'cook', instruction: 'Add the peppers and onion, cook until softened with a char.', durationSeconds: 420, effort: 'active', startOffsetSeconds: 840 },
      { lane: 'toppings', phase: 'prep', instruction: 'Slice the avocado if using and set out soured cream and cheese.', effort: 'active', startOffsetSeconds: 480 },
      { lane: 'toppings', phase: 'cook', instruction: 'Warm the tortilla wraps.', durationSeconds: 60, effort: 'passive', startOffsetSeconds: 1200 },
    ],
  },

  // -------------------------------------------------------------------
  // 15. Pad Thai (parallel)
  // -------------------------------------------------------------------
  {
    seedId: 'pad-thai',
    name: 'Pad Thai',
    description: 'Sweet, sour and salty noodles in one wok.',
    photoEmoji: '🍜',
    baseServings: 2,
    timelineMode: 'parallel',
    lanes: ['noodles', 'wok'],
    tags: ['fish', 'thai', 'hob'],
    ingredients: [
      { canonicalName: 'rice noodles', displayName: 'rice noodles', quantity: 180, unit: 'g' },
      { canonicalName: 'prawns', displayName: 'prawns', quantity: 200, unit: 'g' },
      { canonicalName: 'eggs', displayName: 'egg, beaten', quantity: 2, unit: 'unit' },
      { canonicalName: 'beansprouts', displayName: 'beansprouts', quantity: 100, unit: 'g' },
      { canonicalName: 'spring onion', displayName: 'spring onion, sliced', quantity: 3, unit: 'unit' },
      { canonicalName: 'garlic', displayName: 'garlic, crushed', quantity: 2, unit: 'unit' },
      { canonicalName: 'fish sauce', displayName: 'fish sauce', quantity: 2, unit: 'tbsp' },
      { canonicalName: 'tamarind paste', displayName: 'tamarind paste', quantity: 1, unit: 'tbsp' },
      { canonicalName: 'brown sugar', displayName: 'brown sugar', quantity: 1, unit: 'tbsp' },
      { canonicalName: 'lime', displayName: 'lime, wedges', quantity: 1, unit: 'unit' },
      { canonicalName: 'peanuts', displayName: 'peanuts, crushed', quantity: 30, unit: 'g', optional: true },
      { canonicalName: 'red chilli', displayName: 'red chilli, sliced', quantity: 1, unit: 'unit', optional: true },
      { canonicalName: 'vegetable oil', displayName: 'vegetable oil', quantity: 2, unit: 'tbsp', scalable: false },
    ],
    steps: [
      { lane: 'noodles', phase: 'prep', instruction: 'Soak the rice noodles in hot water until pliable.', durationSeconds: 600, effort: 'passive', startOffsetSeconds: 0 },
      { lane: 'noodles', phase: 'cook', instruction: 'Drain the noodles ready for the wok.', effort: 'active', startOffsetSeconds: 600 },
      { lane: 'wok', phase: 'prep', instruction: 'Mix fish sauce, tamarind paste and brown sugar for the sauce.', effort: 'active', startOffsetSeconds: 0 },
      { lane: 'wok', phase: 'cook', instruction: 'Stir-fry the garlic and prawns in hot oil until the prawns turn pink.', durationSeconds: 240, effort: 'active', startOffsetSeconds: 600 },
      { lane: 'wok', phase: 'cook', instruction: 'Push to one side, scramble the egg in the same pan.', durationSeconds: 90, effort: 'active', startOffsetSeconds: 840 },
      { lane: 'wok', phase: 'cook', instruction: 'Add the noodles, sauce and beansprouts, toss until combined.', durationSeconds: 180, effort: 'active', startOffsetSeconds: 930 },
      { lane: 'wok', phase: 'cook', instruction: 'Serve with spring onion, peanuts, chilli and lime wedges.', effort: 'active', startOffsetSeconds: 1110 },
    ],
  },

  // -------------------------------------------------------------------
  // 16. Lasagne
  // -------------------------------------------------------------------
  {
    seedId: 'lasagne',
    name: 'Lasagne',
    description: 'Layered beef ragu and bechamel, weekend cook.',
    photoEmoji: '🧀',
    baseServings: 6,
    timelineMode: 'sequential',
    tags: ['beef', 'italian', 'comfort', 'oven'],
    ingredients: [
      { canonicalName: 'beef mince', displayName: 'beef mince', quantity: 500, unit: 'g' },
      { canonicalName: 'onion', displayName: 'onion, diced', quantity: 1, unit: 'unit' },
      { canonicalName: 'carrot', displayName: 'carrot, diced', quantity: 1, unit: 'unit' },
      { canonicalName: 'celery', displayName: 'celery, diced', quantity: 1, unit: 'unit' },
      { canonicalName: 'garlic', displayName: 'garlic, crushed', quantity: 2, unit: 'unit' },
      { canonicalName: 'chopped tomatoes', displayName: 'chopped tomatoes', quantity: 800, unit: 'g' },
      { canonicalName: 'tomato puree', displayName: 'tomato puree', quantity: 1, unit: 'tbsp' },
      { canonicalName: 'dried oregano', displayName: 'dried oregano', quantity: 1, unit: 'tsp', scalable: false },
      { canonicalName: 'lasagne sheets', displayName: 'lasagne sheets', quantity: 9, unit: 'unit' },
      { canonicalName: 'butter', displayName: 'butter', quantity: 50, unit: 'g' },
      { canonicalName: 'plain flour', displayName: 'plain flour', quantity: 50, unit: 'g' },
      { canonicalName: 'milk', displayName: 'milk', quantity: 600, unit: 'ml' },
      { canonicalName: 'ground nutmeg', displayName: 'nutmeg, grated', quantity: 1, unit: 'tsp', scalable: false },
      { canonicalName: 'mozzarella', displayName: 'mozzarella, torn', quantity: 125, unit: 'g' },
      { canonicalName: 'parmesan', displayName: 'parmesan, grated', quantity: 40, unit: 'g' },
    ],
    steps: [
      { phase: 'prep', instruction: 'Dice the onion, carrot and celery; crush the garlic.', effort: 'active' },
      { phase: 'cook', instruction: 'Brown the beef mince in a large pan.', durationSeconds: 480, effort: 'active' },
      { phase: 'cook', instruction: 'Add the vegetables and cook until softened.', durationSeconds: 420, effort: 'active' },
      { phase: 'cook', instruction: 'Stir in tomatoes, puree and oregano; simmer the ragu low.', durationSeconds: 2400, effort: 'passive' },
      { phase: 'cook', instruction: 'Melt the butter, whisk in flour, then gradually add milk to make a bechamel.', durationSeconds: 600, effort: 'active' },
      { phase: 'cook', instruction: 'Season the bechamel with nutmeg.', durationSeconds: 30, effort: 'active' },
      { phase: 'cook', instruction: 'Layer ragu, pasta sheets and bechamel in a dish, finishing with bechamel.', effort: 'active' },
      { phase: 'cook', instruction: 'Scatter mozzarella and parmesan over the top.', effort: 'active' },
      { phase: 'cook', instruction: 'Bake until golden and the pasta is tender.', durationSeconds: 2400, effort: 'passive', important: true },
    ],
  },

  // -------------------------------------------------------------------
  // 17. Sausage & Mash
  // -------------------------------------------------------------------
  {
    seedId: 'sausage-and-mash',
    name: 'Sausage & Mash',
    description: 'Bangers, buttery mash and onion gravy.',
    photoEmoji: '🌭',
    baseServings: 4,
    timelineMode: 'sequential',
    tags: ['pork', 'comfort', 'irish'],
    ingredients: [
      { canonicalName: 'pork sausage', displayName: 'pork sausage', quantity: 8, unit: 'unit' },
      { canonicalName: 'potato', displayName: 'potato', quantity: 800, unit: 'g' },
      { canonicalName: 'butter', displayName: 'butter', quantity: 50, unit: 'g' },
      { canonicalName: 'milk', displayName: 'milk', quantity: 100, unit: 'ml' },
      { canonicalName: 'onion', displayName: 'onion, sliced', quantity: 2, unit: 'unit' },
      { canonicalName: 'beef stock cube', displayName: 'beef stock cube', quantity: 1, unit: 'unit', scalable: false },
      { canonicalName: 'water', displayName: 'water', quantity: 300, unit: 'ml' },
      { canonicalName: 'plain flour', displayName: 'plain flour', quantity: 1, unit: 'tbsp' },
      { canonicalName: 'frozen peas', displayName: 'frozen peas', quantity: 100, unit: 'g', optional: true },
    ],
    steps: [
      { phase: 'prep', instruction: 'Peel and chop the potatoes; slice the onions.', effort: 'active' },
      { phase: 'cook', instruction: 'Boil the potatoes until tender.', durationSeconds: 1080, effort: 'passive' },
      { phase: 'cook', instruction: 'Grill or fry the sausages until browned all over and cooked through.', durationSeconds: 1200, effort: 'active' },
      { phase: 'cook', instruction: 'Meanwhile, cook the onions low and slow until deeply softened.', durationSeconds: 1200, effort: 'passive' },
      { phase: 'cook', instruction: 'Stir flour into the onions, then add stock cube and water; simmer to a gravy.', durationSeconds: 480, effort: 'passive' },
      { phase: 'cook', instruction: 'Drain and mash the potatoes with butter and milk.', durationSeconds: 300, effort: 'active' },
      { phase: 'cook', instruction: 'Boil the peas if using.', durationSeconds: 240, effort: 'passive' },
      { phase: 'cook', instruction: 'Serve sausages over mash with onion gravy.', effort: 'active' },
    ],
  },

  // -------------------------------------------------------------------
  // 18. Dublin Coddle
  // -------------------------------------------------------------------
  {
    seedId: 'dublin-coddle',
    name: 'Dublin Coddle',
    description: 'Old Dublin one-pot of sausages, bacon and potato.',
    photoEmoji: '🥔',
    baseServings: 4,
    timelineMode: 'sequential',
    tags: ['pork', 'irish', 'comfort', 'one-pot'],
    ingredients: [
      { canonicalName: 'pork sausage', displayName: 'pork sausage', quantity: 8, unit: 'unit' },
      { canonicalName: 'back bacon', displayName: 'back bacon, chopped', quantity: 6, unit: 'unit' },
      { canonicalName: 'potato', displayName: 'potato, sliced', quantity: 800, unit: 'g' },
      { canonicalName: 'onion', displayName: 'onion, sliced', quantity: 2, unit: 'unit' },
      { canonicalName: 'chicken stock cube', displayName: 'chicken stock cube', quantity: 1, unit: 'unit', scalable: false },
      { canonicalName: 'water', displayName: 'water', quantity: 500, unit: 'ml' },
      { canonicalName: 'bay leaf', displayName: 'bay leaf', quantity: 1, unit: 'unit', scalable: false },
      { canonicalName: 'fresh parsley', displayName: 'parsley, chopped, to serve', quantity: 10, unit: 'g' },
    ],
    steps: [
      { phase: 'prep', instruction: 'Slice the potatoes and onion.', effort: 'active' },
      { phase: 'cook', instruction: 'Brown the sausages and bacon lightly in a large pot.', durationSeconds: 480, effort: 'active' },
      { phase: 'cook', instruction: 'Layer in the potatoes and onion, then add stock cube, water and bay leaf.', effort: 'active' },
      { phase: 'cook', instruction: 'Cover and simmer gently until the potatoes are tender.', durationSeconds: 3600, effort: 'passive' },
      { phase: 'cook', instruction: 'Scatter parsley over before serving.', effort: 'active' },
    ],
  },

  // -------------------------------------------------------------------
  // 19. Seafood Chowder
  // -------------------------------------------------------------------
  {
    seedId: 'seafood-chowder',
    name: 'Seafood Chowder',
    description: 'Thick, creamy west-coast chowder.',
    photoEmoji: '🥣',
    baseServings: 4,
    timelineMode: 'sequential',
    tags: ['fish', 'irish', 'comfort', 'one-pot'],
    ingredients: [
      { canonicalName: 'smoked haddock', displayName: 'smoked haddock', quantity: 200, unit: 'g' },
      { canonicalName: 'white fish fillet', displayName: 'white fish fillet', quantity: 200, unit: 'g' },
      { canonicalName: 'prawns', displayName: 'prawns', quantity: 150, unit: 'g', optional: true },
      { canonicalName: 'butter', displayName: 'butter', quantity: 40, unit: 'g' },
      { canonicalName: 'leek', displayName: 'leek, sliced', quantity: 1, unit: 'unit' },
      { canonicalName: 'onion', displayName: 'onion, diced', quantity: 1, unit: 'unit' },
      { canonicalName: 'potato', displayName: 'potato, diced', quantity: 400, unit: 'g' },
      { canonicalName: 'fish sauce', displayName: 'fish stock cube', quantity: 0, unit: 'unit', optional: true },
      { canonicalName: 'vegetable stock cube', displayName: 'vegetable stock cube', quantity: 1, unit: 'unit', scalable: false },
      { canonicalName: 'water', displayName: 'water', quantity: 400, unit: 'ml' },
      { canonicalName: 'milk', displayName: 'milk', quantity: 300, unit: 'ml' },
      { canonicalName: 'double cream', displayName: 'double cream', quantity: 150, unit: 'ml' },
      { canonicalName: 'sweetcorn', displayName: 'sweetcorn', quantity: 100, unit: 'g' },
      { canonicalName: 'bay leaf', displayName: 'bay leaf', quantity: 1, unit: 'unit', scalable: false },
      { canonicalName: 'fresh parsley', displayName: 'parsley, chopped, to serve', quantity: 10, unit: 'g' },
    ],
    steps: [
      { phase: 'prep', instruction: 'Slice the leek, dice the onion and potato.', effort: 'active' },
      { phase: 'cook', instruction: 'Soften the leek and onion in butter.', durationSeconds: 360, effort: 'active' },
      { phase: 'cook', instruction: 'Add the potato, stock cube, water and bay leaf; simmer until the potato is tender.', durationSeconds: 1200, effort: 'passive' },
      { phase: 'cook', instruction: 'Stir in milk, cream and sweetcorn.', durationSeconds: 60, effort: 'active' },
      { phase: 'cook', instruction: 'Add the fish and simmer gently until just cooked through.', durationSeconds: 600, effort: 'passive' },
      { phase: 'cook', instruction: 'Stir in the prawns if using and warm through.', durationSeconds: 180, effort: 'passive' },
      { phase: 'cook', instruction: 'Scatter parsley over before serving.', effort: 'active' },
    ],
  },

  // -------------------------------------------------------------------
  // 20. Traybake: Chicken & Veg (parallel — a single oven, two "lanes" of veg)
  // -------------------------------------------------------------------
  {
    seedId: 'traybake-chicken-veg',
    name: 'Chicken & Veg Traybake',
    description: 'Everything on one tray, minimal washing up.',
    photoEmoji: '🍗',
    baseServings: 4,
    timelineMode: 'parallel',
    lanes: ['chicken', 'veg'],
    tags: ['chicken', 'healthy', 'traybake', 'oven'],
    ingredients: [
      { canonicalName: 'chicken thigh', displayName: 'chicken thigh, bone-in', quantity: 8, unit: 'unit' },
      { canonicalName: 'potato', displayName: 'potato, chunked', quantity: 500, unit: 'g' },
      { canonicalName: 'red pepper', displayName: 'red pepper, chunked', quantity: 1, unit: 'unit' },
      { canonicalName: 'courgette', displayName: 'courgette, chunked', quantity: 200, unit: 'g' },
      { canonicalName: 'red onion', displayName: 'red onion, wedged', quantity: 1, unit: 'unit' },
      { canonicalName: 'garlic', displayName: 'garlic, whole cloves', quantity: 4, unit: 'unit' },
      { canonicalName: 'fresh thyme', displayName: 'thyme', quantity: 5, unit: 'g' },
      { canonicalName: 'olive oil', displayName: 'olive oil', quantity: 3, unit: 'tbsp', scalable: false },
      { canonicalName: 'lemon', displayName: 'lemon, halved', quantity: 1, unit: 'unit' },
    ],
    steps: [
      { lane: 'chicken', phase: 'prep', instruction: 'Pat the chicken thighs dry.', effort: 'active', startOffsetSeconds: 0 },
      { lane: 'chicken', phase: 'cook', instruction: 'Toss the chicken with half the oil, thyme and seasoning on the tray.', effort: 'active', startOffsetSeconds: 300 },
      { lane: 'chicken', phase: 'cook', instruction: 'Roast until the skin is crisp and the chicken is cooked through.', durationSeconds: 2700, effort: 'passive', startOffsetSeconds: 600, important: true },
      { lane: 'veg', phase: 'prep', instruction: 'Chunk the potato, pepper, courgette and onion.', effort: 'active', startOffsetSeconds: 0 },
      { lane: 'veg', phase: 'cook', instruction: 'Toss the vegetables and garlic with the remaining oil around the chicken.', effort: 'active', startOffsetSeconds: 300 },
      { lane: 'veg', phase: 'cook', instruction: 'Roast until the vegetables are tender and caramelised.', durationSeconds: 2400, effort: 'passive', startOffsetSeconds: 900 },
      { lane: 'veg', phase: 'cook', instruction: 'Squeeze the roasted lemon over everything before serving.', effort: 'active', startOffsetSeconds: 3300 },
    ],
  },

  // -------------------------------------------------------------------
  // 21. Traybake: Sausage & Root Veg (parallel)
  // -------------------------------------------------------------------
  {
    seedId: 'traybake-sausage-root-veg',
    name: 'Sausage & Root Veg Traybake',
    description: 'Sticky roasted roots with sausages, one tray.',
    photoEmoji: '🥕',
    baseServings: 4,
    timelineMode: 'parallel',
    lanes: ['sausages', 'veg'],
    tags: ['pork', 'comfort', 'traybake', 'oven'],
    ingredients: [
      { canonicalName: 'pork sausage', displayName: 'pork sausage', quantity: 8, unit: 'unit' },
      { canonicalName: 'potato', displayName: 'potato, chunked', quantity: 400, unit: 'g' },
      { canonicalName: 'parsnip', displayName: 'parsnip, chunked', quantity: 3, unit: 'unit' },
      { canonicalName: 'carrot', displayName: 'carrot, chunked', quantity: 3, unit: 'unit' },
      { canonicalName: 'red onion', displayName: 'red onion, wedged', quantity: 2, unit: 'unit' },
      { canonicalName: 'olive oil', displayName: 'olive oil', quantity: 3, unit: 'tbsp', scalable: false },
      { canonicalName: 'fresh thyme', displayName: 'thyme', quantity: 5, unit: 'g' },
      { canonicalName: 'honey', displayName: 'honey, drizzled', quantity: 1, unit: 'tbsp', optional: true },
    ],
    steps: [
      { lane: 'veg', phase: 'prep', instruction: 'Chunk the potato, parsnip, carrot and onion.', effort: 'active', startOffsetSeconds: 0 },
      { lane: 'veg', phase: 'cook', instruction: 'Toss the vegetables with oil and thyme on a large tray.', effort: 'active', startOffsetSeconds: 300 },
      { lane: 'veg', phase: 'cook', instruction: 'Roast the vegetables until starting to caramelise.', durationSeconds: 1500, effort: 'passive', startOffsetSeconds: 600 },
      { lane: 'sausages', phase: 'cook', instruction: 'Nestle the sausages among the vegetables.', effort: 'active', startOffsetSeconds: 2100 },
      { lane: 'sausages', phase: 'cook', instruction: 'Roast until the sausages are browned and cooked through.', durationSeconds: 1500, effort: 'passive', startOffsetSeconds: 2400, important: true },
      { lane: 'sausages', phase: 'cook', instruction: 'Drizzle honey over before serving if using.', effort: 'active', startOffsetSeconds: 3900 },
    ],
  },

  // -------------------------------------------------------------------
  // 22. Omelette
  // -------------------------------------------------------------------
  {
    seedId: 'omelette',
    name: 'Omelette',
    description: 'Ready in minutes, whatever is in the fridge.',
    photoEmoji: '🍳',
    baseServings: 1,
    timelineMode: 'sequential',
    tags: ['veg', 'healthy'],
    ingredients: [
      { canonicalName: 'eggs', displayName: 'egg', quantity: 3, unit: 'unit' },
      { canonicalName: 'butter', displayName: 'butter', quantity: 10, unit: 'g' },
      { canonicalName: 'cheddar cheese', displayName: 'cheddar, grated', quantity: 30, unit: 'g', optional: true },
      { canonicalName: 'mushroom', displayName: 'mushroom, sliced', quantity: 40, unit: 'g', optional: true },
      { canonicalName: 'salt', displayName: 'salt', quantity: 1, unit: 'tsp', scalable: false },
      { canonicalName: 'black pepper', displayName: 'black pepper', quantity: 1, unit: 'tsp', scalable: false },
    ],
    steps: [
      { phase: 'prep', instruction: 'Whisk the eggs with salt and pepper.', effort: 'active' },
      { phase: 'cook', instruction: 'Melt the butter in a nonstick pan over medium heat.', durationSeconds: 60, effort: 'active' },
      { phase: 'cook', instruction: 'Fry the mushroom if using until softened.', durationSeconds: 180, effort: 'active' },
      { phase: 'cook', instruction: 'Pour in the eggs and let them set at the edges undisturbed.', durationSeconds: 90, effort: 'passive' },
      { phase: 'cook', instruction: 'Scatter cheese over one half, fold, and slide onto a plate.', durationSeconds: 60, effort: 'active' },
    ],
  },

  // -------------------------------------------------------------------
  // 23. Leek & Potato Soup
  // -------------------------------------------------------------------
  {
    seedId: 'leek-and-potato-soup',
    name: 'Leek & Potato Soup',
    description: 'Silky, cheap, and freezes well.',
    photoEmoji: '🍲',
    baseServings: 4,
    timelineMode: 'sequential',
    tags: ['veg', 'healthy', 'irish', 'one-pot'],
    ingredients: [
      { canonicalName: 'leek', displayName: 'leek, sliced', quantity: 3, unit: 'unit' },
      { canonicalName: 'onion', displayName: 'onion, diced', quantity: 1, unit: 'unit' },
      { canonicalName: 'potato', displayName: 'potato, diced', quantity: 500, unit: 'g' },
      { canonicalName: 'butter', displayName: 'butter', quantity: 30, unit: 'g' },
      { canonicalName: 'vegetable stock cube', displayName: 'vegetable stock cube', quantity: 2, unit: 'unit', scalable: false },
      { canonicalName: 'water', displayName: 'water', quantity: 900, unit: 'ml' },
      { canonicalName: 'double cream', displayName: 'double cream', quantity: 100, unit: 'ml', optional: true },
      { canonicalName: 'fresh parsley', displayName: 'parsley, chopped, to serve', quantity: 10, unit: 'g', optional: true },
    ],
    steps: [
      { phase: 'prep', instruction: 'Slice the leeks and dice the onion and potato.', effort: 'active' },
      { phase: 'cook', instruction: 'Soften the leek and onion in butter without colouring.', durationSeconds: 600, effort: 'active' },
      { phase: 'cook', instruction: 'Add the potato, stock cubes and water; bring to the boil.', durationSeconds: 300, effort: 'active' },
      { phase: 'cook', instruction: 'Simmer until the potato is completely tender.', durationSeconds: 1200, effort: 'passive' },
      { phase: 'cook', instruction: 'Blend until smooth.', durationSeconds: 120, effort: 'active' },
      { phase: 'cook', instruction: 'Stir in cream if using and serve with parsley.', effort: 'active' },
    ],
  },

  // -------------------------------------------------------------------
  // 24. Tomato Soup
  // -------------------------------------------------------------------
  {
    seedId: 'tomato-soup',
    name: 'Tomato Soup',
    description: 'Bright, simple, ten-minutes-of-effort soup.',
    photoEmoji: '🍅',
    baseServings: 4,
    timelineMode: 'sequential',
    tags: ['veg', 'healthy'],
    ingredients: [
      { canonicalName: 'onion', displayName: 'onion, diced', quantity: 1, unit: 'unit' },
      { canonicalName: 'garlic', displayName: 'garlic, crushed', quantity: 2, unit: 'unit' },
      { canonicalName: 'olive oil', displayName: 'olive oil', quantity: 1, unit: 'tbsp', scalable: false },
      { canonicalName: 'chopped tomatoes', displayName: 'chopped tomatoes', quantity: 800, unit: 'g' },
      { canonicalName: 'vegetable stock cube', displayName: 'vegetable stock cube', quantity: 1, unit: 'unit', scalable: false },
      { canonicalName: 'water', displayName: 'water', quantity: 400, unit: 'ml' },
      { canonicalName: 'caster sugar', displayName: 'sugar, pinch', quantity: 1, unit: 'tsp', scalable: false },
      { canonicalName: 'double cream', displayName: 'double cream, to finish', quantity: 60, unit: 'ml', optional: true },
      { canonicalName: 'fresh basil', displayName: 'basil, torn', quantity: 5, unit: 'g', optional: true },
    ],
    steps: [
      { phase: 'prep', instruction: 'Dice the onion and crush the garlic.', effort: 'active' },
      { phase: 'cook', instruction: 'Soften the onion and garlic in olive oil.', durationSeconds: 360, effort: 'active' },
      { phase: 'cook', instruction: 'Add tomatoes, stock cube, water and sugar; bring to a simmer.', durationSeconds: 120, effort: 'active' },
      { phase: 'cook', instruction: 'Simmer to let the flavours come together.', durationSeconds: 900, effort: 'passive' },
      { phase: 'cook', instruction: 'Blend until smooth.', durationSeconds: 90, effort: 'active' },
      { phase: 'cook', instruction: 'Swirl in cream and scatter basil if using.', effort: 'active' },
    ],
  },

  // -------------------------------------------------------------------
  // 25. Chicken Noodle Soup
  // -------------------------------------------------------------------
  {
    seedId: 'chicken-noodle-soup',
    name: 'Chicken Noodle Soup',
    description: 'The cold-and-flu classic.',
    photoEmoji: '🍜',
    baseServings: 4,
    timelineMode: 'sequential',
    tags: ['chicken', 'healthy', 'comfort'],
    ingredients: [
      { canonicalName: 'chicken breast', displayName: 'chicken breast', quantity: 300, unit: 'g' },
      { canonicalName: 'carrot', displayName: 'carrot, sliced', quantity: 2, unit: 'unit' },
      { canonicalName: 'celery', displayName: 'celery, sliced', quantity: 2, unit: 'unit' },
      { canonicalName: 'onion', displayName: 'onion, diced', quantity: 1, unit: 'unit' },
      { canonicalName: 'garlic', displayName: 'garlic, crushed', quantity: 2, unit: 'unit' },
      { canonicalName: 'chicken stock cube', displayName: 'chicken stock cube', quantity: 2, unit: 'unit', scalable: false },
      { canonicalName: 'water', displayName: 'water', quantity: 1200, unit: 'ml' },
      { canonicalName: 'egg noodles', displayName: 'egg noodles', quantity: 150, unit: 'g' },
      { canonicalName: 'fresh parsley', displayName: 'parsley, chopped, to serve', quantity: 10, unit: 'g' },
    ],
    steps: [
      { phase: 'prep', instruction: 'Dice the onion; slice the carrot and celery; crush the garlic.', effort: 'active' },
      { phase: 'cook', instruction: 'Soften the onion, carrot, celery and garlic in a large pot.', durationSeconds: 360, effort: 'active' },
      { phase: 'cook', instruction: 'Add the stock cubes, water and chicken breast; bring to a simmer.', durationSeconds: 300, effort: 'active' },
      { phase: 'cook', instruction: 'Simmer gently until the chicken is cooked through.', durationSeconds: 1200, effort: 'passive' },
      { phase: 'cook', instruction: 'Lift out the chicken, shred it, and return to the pot.', durationSeconds: 300, effort: 'active' },
      { phase: 'cook', instruction: 'Add the noodles and simmer until tender.', durationSeconds: 300, effort: 'passive' },
      { phase: 'cook', instruction: 'Scatter parsley over before serving.', effort: 'active' },
    ],
  },

  // -------------------------------------------------------------------
  // 26. Beef and Guinness Stew
  // -------------------------------------------------------------------
  {
    seedId: 'beef-and-guinness-stew',
    name: 'Beef and Guinness Stew',
    description: 'Deep, dark, unapologetically Irish.',
    photoEmoji: '🍺',
    baseServings: 4,
    timelineMode: 'sequential',
    tags: ['beef', 'irish', 'comfort', 'one-pot'],
    ingredients: [
      { canonicalName: 'beef stewing steak', displayName: 'beef stewing steak, diced', quantity: 600, unit: 'g' },
      { canonicalName: 'plain flour', displayName: 'plain flour, for dusting', quantity: 20, unit: 'g' },
      { canonicalName: 'vegetable oil', displayName: 'vegetable oil', quantity: 2, unit: 'tbsp', scalable: false },
      { canonicalName: 'onion', displayName: 'onion, sliced', quantity: 2, unit: 'unit' },
      { canonicalName: 'carrot', displayName: 'carrot, chunked', quantity: 3, unit: 'unit' },
      { canonicalName: 'celery', displayName: 'celery, chunked', quantity: 2, unit: 'unit' },
      { canonicalName: 'guinness', displayName: 'guinness', quantity: 400, unit: 'ml' },
      { canonicalName: 'beef stock cube', displayName: 'beef stock cube', quantity: 1, unit: 'unit', scalable: false },
      { canonicalName: 'water', displayName: 'water', quantity: 300, unit: 'ml' },
      { canonicalName: 'bay leaf', displayName: 'bay leaf', quantity: 2, unit: 'unit', scalable: false },
      { canonicalName: 'fresh thyme', displayName: 'thyme', quantity: 3, unit: 'g' },
    ],
    steps: [
      { phase: 'prep', instruction: 'Toss the beef in seasoned flour.', effort: 'active' },
      { phase: 'prep', instruction: 'Chop the onion, carrot and celery.', effort: 'active' },
      { phase: 'cook', instruction: 'Brown the beef in batches in hot oil.', durationSeconds: 600, effort: 'active' },
      { phase: 'cook', instruction: 'Soften the onion, carrot and celery in the same pot.', durationSeconds: 360, effort: 'active' },
      { phase: 'cook', instruction: 'Return the beef and add the guinness, stock cube, water, bay leaves and thyme.', durationSeconds: 120, effort: 'active' },
      { phase: 'cook', instruction: 'Cover and simmer low until the beef is fall-apart tender.', durationSeconds: 9000, effort: 'passive' },
      { phase: 'cook', instruction: 'Taste and adjust seasoning before serving.', effort: 'active' },
    ],
  },

  // -------------------------------------------------------------------
  // 27. Fish and Chips (oven) — parallel
  // -------------------------------------------------------------------
  {
    seedId: 'fish-and-chips-oven',
    name: 'Fish and Chips (Oven)',
    description: 'Crisp breaded fish and chips without the deep fryer.',
    photoEmoji: '🍟',
    baseServings: 4,
    timelineMode: 'parallel',
    lanes: ['fish', 'chips'],
    tags: ['fish', 'irish', 'oven'],
    ingredients: [
      { canonicalName: 'white fish fillet', displayName: 'white fish fillet', quantity: 4, unit: 'unit' },
      { canonicalName: 'plain flour', displayName: 'plain flour, for coating', quantity: 50, unit: 'g' },
      { canonicalName: 'eggs', displayName: 'egg, beaten', quantity: 2, unit: 'unit' },
      { canonicalName: 'breadcrumbs', displayName: 'breadcrumbs', quantity: 120, unit: 'g' },
      { canonicalName: 'potato', displayName: 'potato, cut into chips', quantity: 800, unit: 'g' },
      { canonicalName: 'vegetable oil', displayName: 'vegetable oil', quantity: 3, unit: 'tbsp', scalable: false },
      { canonicalName: 'lemon', displayName: 'lemon, wedges', quantity: 1, unit: 'unit' },
      { canonicalName: 'frozen peas', displayName: 'frozen peas, for mushy peas', quantity: 200, unit: 'g', optional: true },
      { canonicalName: 'malt vinegar', displayName: 'malt vinegar, to serve', quantity: 1, unit: 'tbsp', optional: true },
    ],
    steps: [
      { lane: 'chips', phase: 'prep', instruction: 'Cut the potatoes into chips.', effort: 'active', startOffsetSeconds: 0 },
      { lane: 'chips', phase: 'cook', instruction: 'Toss the chips in oil and spread on a tray.', effort: 'active', startOffsetSeconds: 300 },
      { lane: 'chips', phase: 'cook', instruction: 'Roast the chips, turning halfway, until crisp and golden.', durationSeconds: 2400, effort: 'passive', startOffsetSeconds: 600 },
      { lane: 'fish', phase: 'prep', instruction: 'Set up flour, egg and breadcrumbs in three dishes and coat the fish.', effort: 'active', startOffsetSeconds: 300 },
      { lane: 'fish', phase: 'cook', instruction: 'Bake the fish on a separate tray until crisp and cooked through.', durationSeconds: 1200, effort: 'passive', startOffsetSeconds: 1800, important: true },
      { lane: 'fish', phase: 'cook', instruction: 'Boil the peas for mushy peas if using and mash roughly.', durationSeconds: 300, effort: 'passive', startOffsetSeconds: 2700 },
      { lane: 'fish', phase: 'cook', instruction: 'Serve with lemon wedges and vinegar.', effort: 'active', startOffsetSeconds: 3000 },
    ],
  },

  // -------------------------------------------------------------------
  // 28. Bangers and Mash
  // -------------------------------------------------------------------
  {
    seedId: 'bangers-and-mash',
    name: 'Bangers and Mash',
    description: 'Sausages, mash and buttered cabbage.',
    photoEmoji: '🌭',
    baseServings: 4,
    timelineMode: 'sequential',
    tags: ['pork', 'comfort'],
    ingredients: [
      { canonicalName: 'pork sausage', displayName: 'pork sausage', quantity: 8, unit: 'unit' },
      { canonicalName: 'potato', displayName: 'potato', quantity: 800, unit: 'g' },
      { canonicalName: 'butter', displayName: 'butter', quantity: 50, unit: 'g' },
      { canonicalName: 'milk', displayName: 'milk', quantity: 100, unit: 'ml' },
      { canonicalName: 'cabbage', displayName: 'cabbage, shredded', quantity: 300, unit: 'g' },
      { canonicalName: 'onion', displayName: 'onion, sliced', quantity: 1, unit: 'unit' },
      { canonicalName: 'beef stock cube', displayName: 'beef stock cube', quantity: 1, unit: 'unit', scalable: false },
      { canonicalName: 'water', displayName: 'water', quantity: 200, unit: 'ml' },
      { canonicalName: 'english mustard', displayName: 'mustard, to serve', quantity: 1, unit: 'tsp', optional: true },
    ],
    steps: [
      { phase: 'prep', instruction: 'Peel and chop the potatoes; shred the cabbage.', effort: 'active' },
      { phase: 'cook', instruction: 'Boil the potatoes until tender.', durationSeconds: 1080, effort: 'passive' },
      { phase: 'cook', instruction: 'Grill or fry the sausages until browned and cooked through.', durationSeconds: 1200, effort: 'active' },
      { phase: 'cook', instruction: 'Soften the onion, add stock cube and water for a quick gravy.', durationSeconds: 600, effort: 'passive' },
      { phase: 'cook', instruction: 'Steam or boil the cabbage until just tender, tossed in a little butter.', durationSeconds: 360, effort: 'passive' },
      { phase: 'cook', instruction: 'Drain and mash the potatoes with butter and milk.', durationSeconds: 300, effort: 'active' },
      { phase: 'cook', instruction: 'Serve with mustard on the side if using.', effort: 'active' },
    ],
  },

  // -------------------------------------------------------------------
  // 29. Toad in the Hole (parallel)
  // -------------------------------------------------------------------
  {
    seedId: 'toad-in-the-hole',
    name: 'Toad in the Hole',
    description: 'Sausages baked in a puffed Yorkshire batter.',
    photoEmoji: '🧇',
    baseServings: 4,
    timelineMode: 'parallel',
    lanes: ['batter', 'gravy'],
    tags: ['pork', 'comfort', 'oven', 'british'],
    ingredients: [
      { canonicalName: 'pork sausage', displayName: 'pork sausage', quantity: 8, unit: 'unit' },
      { canonicalName: 'plain flour', displayName: 'plain flour', quantity: 140, unit: 'g' },
      { canonicalName: 'eggs', displayName: 'egg', quantity: 3, unit: 'unit' },
      { canonicalName: 'milk', displayName: 'milk', quantity: 200, unit: 'ml' },
      { canonicalName: 'vegetable oil', displayName: 'vegetable oil', quantity: 3, unit: 'tbsp', scalable: false },
      { canonicalName: 'onion', displayName: 'onion, sliced', quantity: 1, unit: 'unit' },
      { canonicalName: 'beef stock cube', displayName: 'beef stock cube', quantity: 1, unit: 'unit', scalable: false },
      { canonicalName: 'water', displayName: 'water', quantity: 250, unit: 'ml' },
    ],
    steps: [
      { lane: 'batter', phase: 'prep', instruction: 'Whisk the flour, eggs and milk into a smooth batter and rest it.', durationSeconds: 900, effort: 'passive', startOffsetSeconds: 0 },
      { lane: 'batter', phase: 'cook', instruction: 'Heat the oil with the sausages in a hot tray in the oven until sizzling.', durationSeconds: 600, effort: 'passive', startOffsetSeconds: 900 },
      { lane: 'batter', phase: 'cook', instruction: 'Pour the batter around the sausages and bake without opening the oven.', durationSeconds: 1800, effort: 'passive', startOffsetSeconds: 1500, important: true },
      { lane: 'gravy', phase: 'prep', instruction: 'Slice the onion.', effort: 'active', startOffsetSeconds: 900 },
      { lane: 'gravy', phase: 'cook', instruction: 'Cook the onion low and slow until deeply softened.', durationSeconds: 1200, effort: 'passive', startOffsetSeconds: 1200 },
      { lane: 'gravy', phase: 'cook', instruction: 'Add stock cube and water, simmer to a gravy.', durationSeconds: 480, effort: 'passive', startOffsetSeconds: 2400 },
    ],
  },

  // -------------------------------------------------------------------
  // 30. Chicken Tikka Masala (parallel)
  // -------------------------------------------------------------------
  {
    seedId: 'chicken-tikka-masala',
    name: 'Chicken Tikka Masala',
    description: 'Creamy, spiced, better than the takeaway.',
    photoEmoji: '🍛',
    baseServings: 4,
    timelineMode: 'parallel',
    lanes: ['chicken', 'sauce', 'rice'],
    tags: ['chicken', 'indian', 'comfort'],
    ingredients: [
      { canonicalName: 'chicken thigh', displayName: 'chicken thigh, diced', quantity: 600, unit: 'g' },
      { canonicalName: 'natural yoghurt', displayName: 'yoghurt, for marinating', quantity: 100, unit: 'g' },
      { canonicalName: 'tikka masala paste', displayName: 'tikka masala paste', quantity: 4, unit: 'tbsp' },
      { canonicalName: 'onion', displayName: 'onion, diced', quantity: 1, unit: 'unit' },
      { canonicalName: 'garlic', displayName: 'garlic, crushed', quantity: 3, unit: 'unit' },
      { canonicalName: 'ginger', displayName: 'ginger, grated', quantity: 15, unit: 'g' },
      { canonicalName: 'chopped tomatoes', displayName: 'chopped tomatoes', quantity: 400, unit: 'g' },
      { canonicalName: 'double cream', displayName: 'double cream', quantity: 100, unit: 'ml' },
      { canonicalName: 'basmati rice', displayName: 'basmati rice', quantity: 300, unit: 'g' },
      { canonicalName: 'fresh coriander', displayName: 'coriander, to serve', quantity: 10, unit: 'g', optional: true },
      { canonicalName: 'vegetable oil', displayName: 'vegetable oil', quantity: 1, unit: 'tbsp', scalable: false },
    ],
    steps: [
      { lane: 'chicken', phase: 'prep', instruction: 'Marinate the chicken in yoghurt and half the tikka paste.', durationSeconds: 900, effort: 'passive', startOffsetSeconds: 0 },
      { lane: 'chicken', phase: 'cook', instruction: 'Sear the marinated chicken in a hot pan until coloured.', durationSeconds: 480, effort: 'active', startOffsetSeconds: 900 },
      { lane: 'sauce', phase: 'prep', instruction: 'Dice the onion, crush the garlic and grate the ginger.', effort: 'active', startOffsetSeconds: 0 },
      { lane: 'sauce', phase: 'cook', instruction: 'Soften the onion, garlic and ginger in oil.', durationSeconds: 360, effort: 'active', startOffsetSeconds: 900 },
      { lane: 'sauce', phase: 'cook', instruction: 'Stir in the remaining tikka paste and tomatoes; simmer.', durationSeconds: 900, effort: 'passive', startOffsetSeconds: 1260 },
      { lane: 'sauce', phase: 'cook', instruction: 'Add the seared chicken and cream, simmer until the chicken is cooked through.', durationSeconds: 600, effort: 'passive', startOffsetSeconds: 2160 },
      { lane: 'sauce', phase: 'cook', instruction: 'Scatter coriander over before serving.', effort: 'active', startOffsetSeconds: 2760 },
      { lane: 'rice', phase: 'prep', instruction: 'Rinse the rice.', effort: 'active', startOffsetSeconds: 1800 },
      { lane: 'rice', phase: 'cook', instruction: 'Cook the rice until tender and rest covered.', durationSeconds: 900, effort: 'passive', startOffsetSeconds: 2100 },
    ],
  },

  // -------------------------------------------------------------------
  // 31. Beef Tacos (parallel)
  // -------------------------------------------------------------------
  {
    seedId: 'beef-tacos',
    name: 'Beef Tacos',
    description: 'Build-your-own taco night.',
    photoEmoji: '🌮',
    baseServings: 4,
    timelineMode: 'parallel',
    lanes: ['beef', 'toppings'],
    tags: ['beef', 'mexican', 'hob'],
    ingredients: [
      { canonicalName: 'beef mince', displayName: 'beef mince', quantity: 500, unit: 'g' },
      { canonicalName: 'onion', displayName: 'onion, diced', quantity: 1, unit: 'unit' },
      { canonicalName: 'garlic', displayName: 'garlic, crushed', quantity: 2, unit: 'unit' },
      { canonicalName: 'ground cumin', displayName: 'ground cumin', quantity: 1, unit: 'tsp' },
      { canonicalName: 'smoked paprika', displayName: 'smoked paprika', quantity: 1, unit: 'tsp' },
      { canonicalName: 'chilli powder', displayName: 'chilli powder', quantity: 1, unit: 'tsp', optional: true },
      { canonicalName: 'tortilla wrap', displayName: 'small tortilla wrap', quantity: 8, unit: 'unit' },
      { canonicalName: 'lettuce', displayName: 'lettuce, shredded', quantity: 1, unit: 'unit' },
      { canonicalName: 'tomato', displayName: 'tomato, diced', quantity: 2, unit: 'unit' },
      { canonicalName: 'cheddar cheese', displayName: 'cheddar, grated', quantity: 80, unit: 'g' },
      { canonicalName: 'soured cream', displayName: 'soured cream', quantity: 100, unit: 'g' },
      { canonicalName: 'avocado', displayName: 'avocado, sliced', quantity: 1, unit: 'unit', optional: true },
      { canonicalName: 'lime', displayName: 'lime, wedges', quantity: 1, unit: 'unit' },
    ],
    steps: [
      { lane: 'beef', phase: 'prep', instruction: 'Dice the onion and crush the garlic.', effort: 'active', startOffsetSeconds: 0 },
      { lane: 'beef', phase: 'cook', instruction: 'Brown the beef mince with the onion and garlic.', durationSeconds: 480, effort: 'active', startOffsetSeconds: 300 },
      { lane: 'beef', phase: 'cook', instruction: 'Stir in the spices and simmer until rich and thick.', durationSeconds: 600, effort: 'passive', startOffsetSeconds: 780 },
      { lane: 'toppings', phase: 'prep', instruction: 'Shred the lettuce, dice the tomato, slice the avocado if using.', effort: 'active', startOffsetSeconds: 300 },
      { lane: 'toppings', phase: 'cook', instruction: 'Warm the tortilla wraps.', durationSeconds: 60, effort: 'passive', startOffsetSeconds: 1200 },
      { lane: 'toppings', phase: 'cook', instruction: 'Set out all the toppings for building tacos.', effort: 'active', startOffsetSeconds: 1260 },
    ],
  },

  // -------------------------------------------------------------------
  // 32. Pesto Pasta
  // -------------------------------------------------------------------
  {
    seedId: 'pesto-pasta',
    name: 'Pesto Pasta',
    description: 'Ready before the kettle finishes reboiling.',
    photoEmoji: '🍝',
    baseServings: 2,
    timelineMode: 'sequential',
    tags: ['veg', 'italian'],
    ingredients: [
      { canonicalName: 'spaghetti', displayName: 'spaghetti', quantity: 200, unit: 'g' },
      { canonicalName: 'pesto', displayName: 'pesto', quantity: 80, unit: 'g' },
      { canonicalName: 'cherry tomatoes', displayName: 'cherry tomatoes, halved', quantity: 100, unit: 'g', optional: true },
      { canonicalName: 'parmesan', displayName: 'parmesan, grated', quantity: 30, unit: 'g' },
      { canonicalName: 'pine nuts', displayName: 'pine nuts, toasted', quantity: 20, unit: 'g', optional: true },
      { canonicalName: 'olive oil', displayName: 'olive oil', quantity: 1, unit: 'tbsp', scalable: false },
    ],
    steps: [
      { phase: 'prep', instruction: 'Halve the cherry tomatoes if using.', effort: 'active' },
      { phase: 'cook', instruction: 'Cook the spaghetti in salted boiling water until al dente.', durationSeconds: 600, effort: 'passive' },
      { phase: 'cook', instruction: 'Toast the pine nuts in a dry pan if using.', durationSeconds: 120, effort: 'active' },
      { phase: 'cook', instruction: 'Toss the drained pasta with pesto, a splash of olive oil and pasta water.', durationSeconds: 90, effort: 'active' },
      { phase: 'cook', instruction: 'Finish with parmesan, tomatoes and pine nuts.', effort: 'active' },
    ],
  },

  // -------------------------------------------------------------------
  // 33. Mac and Cheese
  // -------------------------------------------------------------------
  {
    seedId: 'mac-and-cheese',
    name: 'Mac and Cheese',
    description: 'Baked, golden, and deeply comforting.',
    photoEmoji: '🧀',
    baseServings: 4,
    timelineMode: 'sequential',
    tags: ['veg', 'comfort', 'oven'],
    ingredients: [
      { canonicalName: 'macaroni', displayName: 'macaroni', quantity: 350, unit: 'g' },
      { canonicalName: 'butter', displayName: 'butter', quantity: 50, unit: 'g' },
      { canonicalName: 'plain flour', displayName: 'plain flour', quantity: 50, unit: 'g' },
      { canonicalName: 'milk', displayName: 'milk', quantity: 600, unit: 'ml' },
      { canonicalName: 'cheddar cheese', displayName: 'cheddar, grated', quantity: 200, unit: 'g' },
      { canonicalName: 'dijon mustard', displayName: 'dijon mustard', quantity: 1, unit: 'tsp' },
      { canonicalName: 'breadcrumbs', displayName: 'breadcrumbs, for the top', quantity: 40, unit: 'g', optional: true },
    ],
    steps: [
      { phase: 'prep', instruction: 'Bring a large pot of salted water to the boil.', effort: 'active' },
      { phase: 'cook', instruction: 'Cook the macaroni until al dente.', durationSeconds: 600, effort: 'passive' },
      { phase: 'cook', instruction: 'Melt the butter, whisk in flour, then gradually add milk to make a sauce.', durationSeconds: 480, effort: 'active' },
      { phase: 'cook', instruction: 'Stir in the cheddar and mustard until melted.', durationSeconds: 120, effort: 'active' },
      { phase: 'cook', instruction: 'Combine the drained macaroni with the cheese sauce in a baking dish.', effort: 'active' },
      { phase: 'cook', instruction: 'Scatter breadcrumbs over if using.', effort: 'active' },
      { phase: 'cook', instruction: 'Bake until golden on top.', durationSeconds: 1200, effort: 'passive' },
    ],
  },

  // -------------------------------------------------------------------
  // 34. Salmon Traybake (parallel)
  // -------------------------------------------------------------------
  {
    seedId: 'salmon-traybake',
    name: 'Salmon Traybake',
    description: 'Salmon and Mediterranean veg, one tray, minimal effort.',
    photoEmoji: '🐠',
    baseServings: 2,
    timelineMode: 'parallel',
    lanes: ['salmon', 'veg'],
    tags: ['fish', 'healthy', 'traybake', 'oven'],
    ingredients: [
      { canonicalName: 'salmon fillet', displayName: 'salmon fillet', quantity: 2, unit: 'unit' },
      { canonicalName: 'cherry tomatoes', displayName: 'cherry tomatoes', quantity: 150, unit: 'g' },
      { canonicalName: 'courgette', displayName: 'courgette, sliced', quantity: 200, unit: 'g' },
      { canonicalName: 'red pepper', displayName: 'red pepper, sliced', quantity: 1, unit: 'unit' },
      { canonicalName: 'olive oil', displayName: 'olive oil', quantity: 2, unit: 'tbsp', scalable: false },
      { canonicalName: 'lemon', displayName: 'lemon, sliced', quantity: 1, unit: 'unit' },
      { canonicalName: 'garlic', displayName: 'garlic, crushed', quantity: 2, unit: 'unit' },
      { canonicalName: 'fresh basil', displayName: 'basil, torn, to serve', quantity: 5, unit: 'g', optional: true },
    ],
    steps: [
      { lane: 'veg', phase: 'prep', instruction: 'Slice the courgette and pepper.', effort: 'active', startOffsetSeconds: 0 },
      { lane: 'veg', phase: 'cook', instruction: 'Toss the vegetables with oil and garlic on a tray.', effort: 'active', startOffsetSeconds: 300 },
      { lane: 'veg', phase: 'cook', instruction: 'Roast the vegetables until starting to soften.', durationSeconds: 900, effort: 'passive', startOffsetSeconds: 600 },
      { lane: 'salmon', phase: 'prep', instruction: 'Season the salmon fillets.', effort: 'active', startOffsetSeconds: 900 },
      { lane: 'salmon', phase: 'cook', instruction: 'Nestle the salmon and lemon slices among the vegetables.', effort: 'active', startOffsetSeconds: 1500 },
      { lane: 'salmon', phase: 'cook', instruction: 'Return to the oven and roast until the salmon flakes easily.', durationSeconds: 900, effort: 'passive', startOffsetSeconds: 1560, important: true },
      { lane: 'salmon', phase: 'cook', instruction: 'Scatter basil over before serving if using.', effort: 'active', startOffsetSeconds: 2460 },
    ],
  },

  // -------------------------------------------------------------------
  // 35. Prawn Stir Fry (parallel)
  // -------------------------------------------------------------------
  {
    seedId: 'prawn-stir-fry',
    name: 'Prawn Stir Fry',
    description: 'Fast and light, ready in under twenty minutes.',
    photoEmoji: '🍤',
    baseServings: 2,
    timelineMode: 'parallel',
    lanes: ['rice', 'prawns'],
    tags: ['fish', 'healthy', 'hob', 'asian'],
    ingredients: [
      { canonicalName: 'jasmine rice', displayName: 'jasmine rice', quantity: 180, unit: 'g' },
      { canonicalName: 'prawns', displayName: 'prawns', quantity: 300, unit: 'g' },
      { canonicalName: 'broccoli', displayName: 'broccoli, small florets', quantity: 150, unit: 'g' },
      { canonicalName: 'sugar snap peas', displayName: 'sugar snap peas', quantity: 100, unit: 'g' },
      { canonicalName: 'garlic', displayName: 'garlic, crushed', quantity: 2, unit: 'unit' },
      { canonicalName: 'ginger', displayName: 'ginger, grated', quantity: 10, unit: 'g' },
      { canonicalName: 'soy sauce', displayName: 'soy sauce', quantity: 2, unit: 'tbsp' },
      { canonicalName: 'sesame oil', displayName: 'sesame oil', quantity: 1, unit: 'tsp' },
      { canonicalName: 'vegetable oil', displayName: 'vegetable oil', quantity: 1, unit: 'tbsp', scalable: false },
    ],
    steps: [
      { lane: 'rice', phase: 'prep', instruction: 'Rinse the rice.', effort: 'active', startOffsetSeconds: 0 },
      { lane: 'rice', phase: 'cook', instruction: 'Cook the rice until tender and rest covered.', durationSeconds: 720, effort: 'passive', startOffsetSeconds: 60 },
      { lane: 'prawns', phase: 'prep', instruction: 'Prepare the broccoli and sugar snap peas.', effort: 'active', startOffsetSeconds: 0 },
      { lane: 'prawns', phase: 'cook', instruction: 'Stir-fry the garlic and ginger briefly in hot oil.', durationSeconds: 60, effort: 'active', startOffsetSeconds: 480 },
      { lane: 'prawns', phase: 'cook', instruction: 'Add the broccoli and sugar snap peas, stir-fry until just tender.', durationSeconds: 300, effort: 'active', startOffsetSeconds: 540 },
      { lane: 'prawns', phase: 'cook', instruction: 'Add the prawns and cook until pink through.', durationSeconds: 180, effort: 'active', startOffsetSeconds: 840 },
      { lane: 'prawns', phase: 'cook', instruction: 'Finish with soy sauce and sesame oil.', durationSeconds: 30, effort: 'active', startOffsetSeconds: 1020 },
    ],
  },

  // -------------------------------------------------------------------
  // 36. Veggie Chilli
  // -------------------------------------------------------------------
  {
    seedId: 'veggie-chilli',
    name: 'Veggie Chilli',
    description: 'Hearty bean chilli, no meat needed.',
    photoEmoji: '🌶️',
    baseServings: 4,
    timelineMode: 'sequential',
    tags: ['veg', 'healthy', 'mexican', 'one-pot'],
    ingredients: [
      { canonicalName: 'onion', displayName: 'onion, diced', quantity: 1, unit: 'unit' },
      { canonicalName: 'garlic', displayName: 'garlic, crushed', quantity: 2, unit: 'unit' },
      { canonicalName: 'red pepper', displayName: 'red pepper, diced', quantity: 1, unit: 'unit' },
      { canonicalName: 'aubergine', displayName: 'aubergine, diced', quantity: 200, unit: 'g' },
      { canonicalName: 'chilli powder', displayName: 'chilli powder', quantity: 2, unit: 'tsp' },
      { canonicalName: 'ground cumin', displayName: 'ground cumin', quantity: 1, unit: 'tsp' },
      { canonicalName: 'chopped tomatoes', displayName: 'chopped tomatoes', quantity: 800, unit: 'g' },
      { canonicalName: 'kidney beans', displayName: 'kidney beans, drained', quantity: 400, unit: 'g' },
      { canonicalName: 'vegetable stock cube', displayName: 'vegetable stock cube', quantity: 1, unit: 'unit', scalable: false },
      { canonicalName: 'basmati rice', displayName: 'basmati rice, to serve', quantity: 300, unit: 'g' },
      { canonicalName: 'soured cream', displayName: 'soured cream, to serve', quantity: 60, unit: 'g', optional: true },
    ],
    steps: [
      { phase: 'prep', instruction: 'Dice the onion, pepper and aubergine; crush the garlic.', effort: 'active' },
      { phase: 'cook', instruction: 'Soften the onion, garlic, pepper and aubergine in a large pot.', durationSeconds: 480, effort: 'active' },
      { phase: 'cook', instruction: 'Stir in chilli powder and cumin, cook briefly.', durationSeconds: 60, effort: 'active' },
      { phase: 'cook', instruction: 'Add tomatoes, kidney beans and crumbled stock cube; simmer low.', durationSeconds: 2100, effort: 'passive' },
      { phase: 'cook', instruction: 'Cook the rice in salted boiling water until tender.', durationSeconds: 900, effort: 'passive' },
      { phase: 'cook', instruction: 'Serve the chilli over rice with soured cream if using.', effort: 'active' },
    ],
  },

  // -------------------------------------------------------------------
  // 37. Lentil Soup
  // -------------------------------------------------------------------
  {
    seedId: 'lentil-soup',
    name: 'Lentil Soup',
    description: 'Cheap, filling, and full of goodness.',
    photoEmoji: '🍲',
    baseServings: 4,
    timelineMode: 'sequential',
    tags: ['veg', 'healthy', 'one-pot'],
    ingredients: [
      { canonicalName: 'onion', displayName: 'onion, diced', quantity: 1, unit: 'unit' },
      { canonicalName: 'carrot', displayName: 'carrot, diced', quantity: 2, unit: 'unit' },
      { canonicalName: 'celery', displayName: 'celery, diced', quantity: 2, unit: 'unit' },
      { canonicalName: 'garlic', displayName: 'garlic, crushed', quantity: 2, unit: 'unit' },
      { canonicalName: 'ground cumin', displayName: 'ground cumin', quantity: 1, unit: 'tsp' },
      { canonicalName: 'red lentils', displayName: 'red lentils, rinsed', quantity: 250, unit: 'g' },
      { canonicalName: 'chopped tomatoes', displayName: 'chopped tomatoes', quantity: 400, unit: 'g' },
      { canonicalName: 'vegetable stock cube', displayName: 'vegetable stock cube', quantity: 2, unit: 'unit', scalable: false },
      { canonicalName: 'water', displayName: 'water', quantity: 1000, unit: 'ml' },
      { canonicalName: 'olive oil', displayName: 'olive oil', quantity: 1, unit: 'tbsp', scalable: false },
    ],
    steps: [
      { phase: 'prep', instruction: 'Dice the onion, carrot and celery; crush the garlic.', effort: 'active' },
      { phase: 'cook', instruction: 'Soften the vegetables in olive oil.', durationSeconds: 480, effort: 'active' },
      { phase: 'cook', instruction: 'Stir in the cumin, then add the lentils, tomatoes, stock cubes and water.', durationSeconds: 120, effort: 'active' },
      { phase: 'cook', instruction: 'Simmer until the lentils have completely broken down.', durationSeconds: 1800, effort: 'passive' },
      { phase: 'cook', instruction: 'Blend partially or fully depending on preferred texture.', durationSeconds: 90, effort: 'active' },
    ],
  },

  // -------------------------------------------------------------------
  // 38. Chicken Caesar Salad (parallel)
  // -------------------------------------------------------------------
  {
    seedId: 'chicken-caesar-salad',
    name: 'Chicken Caesar Salad',
    description: 'Crisp romaine, crunchy croutons, garlicky dressing.',
    photoEmoji: '🥗',
    baseServings: 2,
    timelineMode: 'parallel',
    lanes: ['chicken', 'salad'],
    tags: ['chicken', 'healthy'],
    ingredients: [
      { canonicalName: 'chicken breast', displayName: 'chicken breast', quantity: 300, unit: 'g' },
      { canonicalName: 'olive oil', displayName: 'olive oil', quantity: 2, unit: 'tbsp', scalable: false },
      { canonicalName: 'romaine lettuce', displayName: 'romaine lettuce, torn', quantity: 1, unit: 'unit' },
      { canonicalName: 'bread', displayName: 'bread, cubed, for croutons', quantity: 3, unit: 'unit' },
      { canonicalName: 'parmesan', displayName: 'parmesan, shaved', quantity: 40, unit: 'g' },
      { canonicalName: 'mayonnaise', displayName: 'mayonnaise', quantity: 3, unit: 'tbsp' },
      { canonicalName: 'garlic', displayName: 'garlic, crushed', quantity: 1, unit: 'unit' },
      { canonicalName: 'lemon', displayName: 'lemon, juiced', quantity: 1, unit: 'unit' },
      { canonicalName: 'anchovy fillet', displayName: 'anchovy fillet, finely chopped', quantity: 2, unit: 'unit', optional: true },
    ],
    steps: [
      { lane: 'chicken', phase: 'prep', instruction: 'Season the chicken breast.', effort: 'active', startOffsetSeconds: 0 },
      { lane: 'chicken', phase: 'cook', instruction: 'Pan-fry the chicken in oil until cooked through.', durationSeconds: 600, effort: 'active', startOffsetSeconds: 300 },
      { lane: 'chicken', phase: 'cook', instruction: 'Rest, then slice the chicken.', durationSeconds: 180, effort: 'passive', startOffsetSeconds: 900 },
      { lane: 'salad', phase: 'prep', instruction: 'Tear the lettuce and cube the bread for croutons.', effort: 'active', startOffsetSeconds: 0 },
      { lane: 'salad', phase: 'cook', instruction: 'Toast the bread cubes until golden and crisp.', durationSeconds: 480, effort: 'passive', startOffsetSeconds: 300 },
      { lane: 'salad', phase: 'cook', instruction: 'Whisk mayonnaise, garlic, lemon juice and anchovy if using into a dressing.', durationSeconds: 120, effort: 'active', startOffsetSeconds: 780 },
      { lane: 'salad', phase: 'cook', instruction: 'Toss the lettuce with dressing, croutons, parmesan and sliced chicken.', effort: 'active', startOffsetSeconds: 1080 },
    ],
  },

  // -------------------------------------------------------------------
  // 39. BLT
  // -------------------------------------------------------------------
  {
    seedId: 'blt',
    name: 'BLT',
    description: 'Bacon, lettuce and tomato, nothing more needed.',
    photoEmoji: '🥪',
    baseServings: 2,
    timelineMode: 'sequential',
    tags: ['pork'],
    ingredients: [
      { canonicalName: 'back bacon', displayName: 'back bacon', quantity: 6, unit: 'unit' },
      { canonicalName: 'bread', displayName: 'bread, toasted', quantity: 4, unit: 'unit' },
      { canonicalName: 'lettuce', displayName: 'lettuce, leaves', quantity: 1, unit: 'unit' },
      { canonicalName: 'tomato', displayName: 'tomato, sliced', quantity: 2, unit: 'unit' },
      { canonicalName: 'mayonnaise', displayName: 'mayonnaise', quantity: 2, unit: 'tbsp' },
    ],
    steps: [
      { phase: 'prep', instruction: 'Slice the tomato and separate the lettuce leaves.', effort: 'active' },
      { phase: 'cook', instruction: 'Fry or grill the bacon until crisp.', durationSeconds: 480, effort: 'active' },
      { phase: 'cook', instruction: 'Toast the bread.', durationSeconds: 180, effort: 'passive' },
      { phase: 'cook', instruction: 'Spread mayonnaise on the toast and layer with bacon, lettuce and tomato.', effort: 'active' },
    ],
  },

  // -------------------------------------------------------------------
  // 40. Full Irish Breakfast (parallel)
  // -------------------------------------------------------------------
  {
    seedId: 'full-irish-breakfast',
    name: 'Full Irish Breakfast',
    description: 'The works: sausage, bacon, egg, pudding and beans.',
    photoEmoji: '🥓',
    baseServings: 2,
    timelineMode: 'parallel',
    lanes: ['grill', 'pan', 'toast'],
    tags: ['pork', 'irish', 'comfort', 'hob'],
    ingredients: [
      { canonicalName: 'pork sausage', displayName: 'pork sausage', quantity: 4, unit: 'unit' },
      { canonicalName: 'streaky bacon', displayName: 'streaky bacon', quantity: 4, unit: 'unit' },
      { canonicalName: 'black pudding', displayName: 'black pudding, sliced', quantity: 4, unit: 'unit' },
      { canonicalName: 'white pudding', displayName: 'white pudding, sliced', quantity: 4, unit: 'unit' },
      { canonicalName: 'eggs', displayName: 'egg', quantity: 2, unit: 'unit' },
      { canonicalName: 'baked beans', displayName: 'baked beans', quantity: 200, unit: 'g' },
      { canonicalName: 'mushroom', displayName: 'mushroom, sliced', quantity: 100, unit: 'g' },
      { canonicalName: 'tomato', displayName: 'tomato, halved', quantity: 2, unit: 'unit' },
      { canonicalName: 'bread', displayName: 'bread', quantity: 4, unit: 'unit' },
      { canonicalName: 'vegetable oil', displayName: 'vegetable oil', quantity: 2, unit: 'tbsp', scalable: false },
      { canonicalName: 'brown sauce', displayName: 'brown sauce, to serve', quantity: 1, unit: 'tbsp', optional: true },
    ],
    steps: [
      { lane: 'grill', phase: 'prep', instruction: 'Halve the tomatoes and slice the mushroom.', effort: 'active', startOffsetSeconds: 0 },
      { lane: 'grill', phase: 'cook', instruction: 'Grill the sausages, bacon and puddings until browned and cooked through.', durationSeconds: 900, effort: 'active', startOffsetSeconds: 300, important: true },
      { lane: 'pan', phase: 'cook', instruction: 'Fry the mushroom and tomato in oil until softened.', durationSeconds: 480, effort: 'active', startOffsetSeconds: 600 },
      { lane: 'pan', phase: 'cook', instruction: 'Warm the baked beans in a small pot.', durationSeconds: 300, effort: 'passive', startOffsetSeconds: 900 },
      { lane: 'pan', phase: 'cook', instruction: 'Fry the eggs to your liking.', durationSeconds: 240, effort: 'active', startOffsetSeconds: 1200 },
      { lane: 'toast', phase: 'cook', instruction: 'Toast the bread.', durationSeconds: 180, effort: 'passive', startOffsetSeconds: 1200 },
      { lane: 'toast', phase: 'cook', instruction: 'Plate everything together with brown sauce on the side if using.', effort: 'active', startOffsetSeconds: 1440 },
    ],
  },

  // -------------------------------------------------------------------
  // 41. Pancakes
  // -------------------------------------------------------------------
  {
    seedId: 'pancakes',
    name: 'Pancakes',
    description: 'Weekend batter, lemon and sugar or whatever you fancy.',
    photoEmoji: '🥞',
    baseServings: 4,
    timelineMode: 'sequential',
    tags: ['veg', 'comfort'],
    ingredients: [
      { canonicalName: 'plain flour', displayName: 'plain flour', quantity: 200, unit: 'g' },
      { canonicalName: 'eggs', displayName: 'egg', quantity: 2, unit: 'unit' },
      { canonicalName: 'milk', displayName: 'milk', quantity: 300, unit: 'ml' },
      { canonicalName: 'caster sugar', displayName: 'sugar', quantity: 1, unit: 'tbsp' },
      { canonicalName: 'butter', displayName: 'butter, for frying', quantity: 20, unit: 'g', scalable: false },
      { canonicalName: 'lemon', displayName: 'lemon, to serve', quantity: 1, unit: 'unit', optional: true },
    ],
    steps: [
      { phase: 'prep', instruction: 'Whisk the flour, eggs and milk into a smooth batter.', effort: 'active' },
      { phase: 'cook', instruction: 'Rest the batter briefly.', durationSeconds: 600, effort: 'passive' },
      { phase: 'cook', instruction: 'Melt a little butter in a hot pan and pour in a ladle of batter.', durationSeconds: 30, effort: 'active' },
      { phase: 'cook', instruction: 'Cook until bubbles appear, then flip and cook the other side.', durationSeconds: 90, effort: 'active' },
      { phase: 'cook', instruction: 'Repeat with the remaining batter, keeping pancakes warm.', durationSeconds: 600, effort: 'active' },
      { phase: 'cook', instruction: 'Serve with sugar and a squeeze of lemon if using.', effort: 'active' },
    ],
  },

  // -------------------------------------------------------------------
  // 42. Chicken Kiev (parallel)
  // -------------------------------------------------------------------
  {
    seedId: 'chicken-kiev',
    name: 'Chicken Kiev',
    description: 'Garlic butter oozing out of a crisp crumb.',
    photoEmoji: '🧈',
    baseServings: 4,
    timelineMode: 'parallel',
    lanes: ['chicken', 'sides'],
    tags: ['chicken', 'oven', 'comfort'],
    ingredients: [
      { canonicalName: 'chicken breast', displayName: 'chicken breast', quantity: 4, unit: 'unit' },
      { canonicalName: 'butter', displayName: 'butter, softened', quantity: 80, unit: 'g' },
      { canonicalName: 'garlic', displayName: 'garlic, crushed', quantity: 4, unit: 'unit' },
      { canonicalName: 'fresh parsley', displayName: 'parsley, chopped', quantity: 10, unit: 'g' },
      { canonicalName: 'plain flour', displayName: 'plain flour, for coating', quantity: 50, unit: 'g' },
      { canonicalName: 'eggs', displayName: 'egg, beaten', quantity: 2, unit: 'unit' },
      { canonicalName: 'breadcrumbs', displayName: 'breadcrumbs', quantity: 120, unit: 'g' },
      { canonicalName: 'potato', displayName: 'potato, for mash', quantity: 600, unit: 'g' },
      { canonicalName: 'frozen peas', displayName: 'frozen peas', quantity: 150, unit: 'g' },
      { canonicalName: 'milk', displayName: 'milk', quantity: 80, unit: 'ml' },
    ],
    steps: [
      { lane: 'chicken', phase: 'prep', instruction: 'Mix the softened butter with garlic and parsley, then chill until firm.', durationSeconds: 1200, effort: 'passive', startOffsetSeconds: 0 },
      { lane: 'chicken', phase: 'prep', instruction: 'Cut a pocket into each chicken breast and stuff with the garlic butter.', effort: 'active', startOffsetSeconds: 1200 },
      { lane: 'chicken', phase: 'prep', instruction: 'Coat the chicken in flour, egg, then breadcrumbs.', effort: 'active', startOffsetSeconds: 1500 },
      { lane: 'chicken', phase: 'cook', instruction: 'Bake the chicken until golden and cooked through.', durationSeconds: 1800, effort: 'passive', startOffsetSeconds: 1800, important: true },
      { lane: 'sides', phase: 'prep', instruction: 'Peel and chop the potatoes.', effort: 'active', startOffsetSeconds: 0 },
      { lane: 'sides', phase: 'cook', instruction: 'Boil the potatoes until tender.', durationSeconds: 1080, effort: 'passive', startOffsetSeconds: 2400 },
      { lane: 'sides', phase: 'cook', instruction: 'Boil the peas for the last few minutes.', durationSeconds: 300, effort: 'passive', startOffsetSeconds: 3180 },
      { lane: 'sides', phase: 'cook', instruction: 'Drain and mash the potatoes with milk.', durationSeconds: 300, effort: 'active', startOffsetSeconds: 3480 },
    ],
  },

  // -------------------------------------------------------------------
  // 43. Sweet and Sour Pork (parallel)
  // -------------------------------------------------------------------
  {
    seedId: 'sweet-and-sour-pork',
    name: 'Sweet and Sour Pork',
    description: 'Sticky, tangy, better than the takeaway.',
    photoEmoji: '🍊',
    baseServings: 4,
    timelineMode: 'parallel',
    lanes: ['rice', 'pork', 'sauce'],
    tags: ['pork', 'asian', 'hob'],
    ingredients: [
      { canonicalName: 'jasmine rice', displayName: 'jasmine rice', quantity: 300, unit: 'g' },
      { canonicalName: 'pork loin', displayName: 'pork loin, diced', quantity: 500, unit: 'g' },
      { canonicalName: 'cornflour', displayName: 'cornflour, for coating', quantity: 40, unit: 'g' },
      { canonicalName: 'vegetable oil', displayName: 'vegetable oil', quantity: 3, unit: 'tbsp', scalable: false },
      { canonicalName: 'red pepper', displayName: 'red pepper, chunked', quantity: 1, unit: 'unit' },
      { canonicalName: 'green pepper', displayName: 'green pepper, chunked', quantity: 1, unit: 'unit' },
      { canonicalName: 'pineapple chunks', displayName: 'pineapple chunks, drained', quantity: 200, unit: 'g' },
      { canonicalName: 'tomato ketchup', displayName: 'tomato ketchup', quantity: 3, unit: 'tbsp' },
      { canonicalName: 'rice vinegar', displayName: 'rice vinegar', quantity: 2, unit: 'tbsp' },
      { canonicalName: 'soy sauce', displayName: 'soy sauce', quantity: 1, unit: 'tbsp' },
      { canonicalName: 'brown sugar', displayName: 'brown sugar', quantity: 2, unit: 'tbsp' },
      { canonicalName: 'garlic', displayName: 'garlic, crushed', quantity: 2, unit: 'unit' },
      { canonicalName: 'ginger', displayName: 'ginger, grated', quantity: 10, unit: 'g' },
    ],
    steps: [
      { lane: 'rice', phase: 'prep', instruction: 'Rinse the rice.', effort: 'active', startOffsetSeconds: 0 },
      { lane: 'rice', phase: 'cook', instruction: 'Cook the rice until tender and rest covered.', durationSeconds: 900, effort: 'passive', startOffsetSeconds: 60 },
      { lane: 'pork', phase: 'prep', instruction: 'Toss the pork in cornflour.', effort: 'active', startOffsetSeconds: 0 },
      { lane: 'pork', phase: 'cook', instruction: 'Fry the pork in batches until golden and cooked through.', durationSeconds: 480, effort: 'active', startOffsetSeconds: 300 },
      { lane: 'sauce', phase: 'prep', instruction: 'Mix ketchup, rice vinegar, soy sauce and brown sugar for the sauce.', effort: 'active', startOffsetSeconds: 300 },
      { lane: 'sauce', phase: 'cook', instruction: 'Stir-fry the peppers, garlic and ginger briefly.', durationSeconds: 240, effort: 'active', startOffsetSeconds: 780 },
      { lane: 'sauce', phase: 'cook', instruction: 'Add the pineapple, sauce and fried pork; toss until glossy and thickened.', durationSeconds: 300, effort: 'active', startOffsetSeconds: 1020 },
    ],
  },

  // -------------------------------------------------------------------
  // 44. Chicken Fried Rice (parallel)
  // -------------------------------------------------------------------
  {
    seedId: 'chicken-fried-rice',
    name: 'Chicken Fried Rice',
    description: 'The best thing to do with leftover rice.',
    photoEmoji: '🍚',
    baseServings: 4,
    timelineMode: 'parallel',
    lanes: ['rice', 'chicken'],
    tags: ['chicken', 'asian', 'hob'],
    ingredients: [
      { canonicalName: 'jasmine rice', displayName: 'jasmine rice', quantity: 300, unit: 'g' },
      { canonicalName: 'chicken thigh', displayName: 'chicken thigh, diced', quantity: 400, unit: 'g' },
      { canonicalName: 'eggs', displayName: 'egg, beaten', quantity: 2, unit: 'unit' },
      { canonicalName: 'frozen peas', displayName: 'frozen peas', quantity: 100, unit: 'g' },
      { canonicalName: 'carrot', displayName: 'carrot, diced small', quantity: 1, unit: 'unit' },
      { canonicalName: 'spring onion', displayName: 'spring onion, sliced', quantity: 3, unit: 'unit' },
      { canonicalName: 'garlic', displayName: 'garlic, crushed', quantity: 2, unit: 'unit' },
      { canonicalName: 'ginger', displayName: 'ginger, grated', quantity: 8, unit: 'g' },
      { canonicalName: 'soy sauce', displayName: 'soy sauce', quantity: 2, unit: 'tbsp' },
      { canonicalName: 'sesame oil', displayName: 'sesame oil', quantity: 1, unit: 'tsp', optional: true },
      { canonicalName: 'vegetable oil', displayName: 'vegetable oil', quantity: 2, unit: 'tbsp', scalable: false },
    ],
    steps: [
      { lane: 'rice', phase: 'prep', instruction: 'Rinse the rice.', effort: 'active', startOffsetSeconds: 0 },
      { lane: 'rice', phase: 'cook', instruction: 'Cook the rice until tender, then spread out to cool.', durationSeconds: 900, effort: 'passive', startOffsetSeconds: 60 },
      { lane: 'chicken', phase: 'prep', instruction: 'Dice the chicken and carrot; slice the spring onion.', effort: 'active', startOffsetSeconds: 0 },
      { lane: 'chicken', phase: 'cook', instruction: 'Stir-fry the chicken in hot oil until cooked through.', durationSeconds: 420, effort: 'active', startOffsetSeconds: 960 },
      { lane: 'chicken', phase: 'cook', instruction: 'Add the carrot, garlic and ginger, cook briefly.', durationSeconds: 180, effort: 'active', startOffsetSeconds: 1380 },
      { lane: 'chicken', phase: 'cook', instruction: 'Push everything aside and scramble the egg in the same pan.', durationSeconds: 90, effort: 'active', startOffsetSeconds: 1560 },
      { lane: 'chicken', phase: 'cook', instruction: 'Add the cooled rice, peas, soy sauce and sesame oil; toss until hot through.', durationSeconds: 300, effort: 'active', startOffsetSeconds: 1650 },
      { lane: 'chicken', phase: 'cook', instruction: 'Scatter spring onion over before serving.', effort: 'active', startOffsetSeconds: 1950 },
    ],
  },
];
