import { render } from '@testing-library/react-native';
import { RecipeDetailScreen } from '../../recipes/RecipeDetailScreen';
import type { EnrichedRecipe } from '../../recipes/loadRecipes';

function baseRecipe(overrides: Partial<EnrichedRecipe> = {}): EnrichedRecipe {
  return {
    id: 1,
    shareId: 'share-1',
    name: 'Thai Green Curry',
    description: 'Weeknight staple.',
    photoUri: null,
    photoEmoji: '🍛',
    visibility: 'private',
    baseServings: 2,
    timelineMode: 'sequential',
    source: 'seed',
    seedId: 'thai-green-curry',
    originLabel: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tags: ['chicken'],
    ingredients: [
      {
        id: 1,
        canonicalId: 1,
        canonicalName: 'Chicken thigh',
        displayName: 'Chicken thigh',
        quantity: 400,
        unit: 'g',
        scalable: true,
        optional: false,
        measured: true,
        inPantry: true,
        packSize: null,
        packLabel: null,
        costUpdatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 2,
        canonicalId: 2,
        canonicalName: 'Coconut milk',
        displayName: 'Coconut milk',
        quantity: 400,
        unit: 'ml',
        scalable: true,
        optional: false,
        measured: true,
        inPantry: false,
        packSize: null,
        packLabel: null,
        costUpdatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    steps: [
      { id: 1, phase: 'prep', instruction: 'Dice the chicken', durationSeconds: 300, startOffsetSeconds: 0, effort: 'active', important: false, laneName: null },
      { id: 2, phase: 'cook', instruction: 'Simmer', durationSeconds: 1080, startOffsetSeconds: 300, effort: 'passive', important: true, laneName: null },
    ],
    activeSeconds: 300,
    passiveSeconds: 1080,
    totalSeconds: 1380,
    durationBucket: '20to40',
    kcalPerServing: 612,
    proteinPerServing: 38,
    carbsPerServing: 21,
    fatPerServing: 41,
    costPerServing: 4.2,
    macroCompleteCount: 2,
    costCompleteCount: 2,
    totalIngredientCount: 2,
    timesCooked: 7,
    avgRating: 4.5,
    lastCookedAt: '2026-06-01T00:00:00.000Z',
    isFavourite: false,
    exclusion: null,
    hasStaleCost: false,
    logNotes: [],
    householdRatings: [],
    ...overrides,
  };
}

const noop = () => {};
const noopAsync = async () => {};

async function renderDetail(recipe: EnrichedRecipe) {
  return render(
    <RecipeDetailScreen
      recipe={recipe}
      currencySymbol="€"
      onBack={noop}
      onEdit={noop}
      onCopy={noopAsync}
      onDelete={noop}
      onToggleFavourite={noopAsync}
      onSetExclusion={noop}
      onClearExclusion={noopAsync}
      onStartCooking={noop}
      onAlreadyCookedThis={noop}
      onAddToShoppingList={noopAsync}
      onShare={noop}
    />,
  );
}

describe('RecipeDetailScreen (§5.5, §11.2 snapshot suite)', () => {
  it('renders full data', async () => {
    const result = await renderDetail(baseRecipe());
    expect(result.toJSON()).toMatchSnapshot();
  });

  it('renders partial macros with the "N of M ingredients" flag', async () => {
    const recipe = baseRecipe({
      macroCompleteCount: 1,
      kcalPerServing: 306,
      proteinPerServing: 19,
      carbsPerServing: 0,
      fatPerServing: 6,
      costPerServing: null,
    });
    const result = await renderDetail(recipe);
    expect(result.toJSON()).toMatchSnapshot();
  });

  it('renders the emoji tile when there is no photo', async () => {
    const recipe = baseRecipe({ photoUri: null, photoEmoji: '🍛' });
    const result = await renderDetail(recipe);
    expect(result.toJSON()).toMatchSnapshot();
  });
});
