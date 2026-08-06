// §11.2 snapshot suite — "rendered against every theme in the roster, not
// just two. A theme that's never rendered in a test is a theme that's
// silently broken." This is the only thing that catches a hardcoded hex
// literal, since the bug is invisible until someone switches theme. The
// matrix grows automatically as themes are added to the record.
import { render } from '@testing-library/react-native';
import { RecipeDetailScreen } from '../../recipes/RecipeDetailScreen';
import type { EnrichedRecipe } from '../../recipes/loadRecipes';
import { ThemeProvider } from '../../theme/ThemeContext';
import { themes, type ThemeId } from '../../theme/themes';

function baseRecipe(): EnrichedRecipe {
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
    macroCompleteCount: 1,
    costCompleteCount: 1,
    totalIngredientCount: 1,
    timesCooked: 7,
    avgRating: 4.5,
    lastCookedAt: '2026-06-01T00:00:00.000Z',
    isFavourite: false,
    exclusion: null,
    hasStaleCost: false,
    logNotes: [],
    householdRatings: [],
  };
}

const noop = () => {};
const noopAsync = async () => {};

const themeIds = Object.keys(themes) as ThemeId[];

describe('theme matrix (§11.2) — every theme renders the recipe detail without a hardcoded colour', () => {
  for (const themeId of themeIds) {
    it(`renders under the ${themeId} theme`, async () => {
      const result = await render(
      <ThemeProvider overrideThemeId={themeId}>
        <RecipeDetailScreen
          recipe={baseRecipe()}
          currencySymbol="€"
          ratingBreakdown={{ myRating: 4.5, household: [], householdAverage: null }}
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
        />
        </ThemeProvider>,
      );
      expect(result.toJSON()).toMatchSnapshot();
    });
  }
});
