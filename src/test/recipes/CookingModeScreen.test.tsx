import { render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DbProvider } from '../../db/DbContext';
import { CookingModeScreen } from '../../recipes/CookingModeScreen';
import type { EnrichedRecipe } from '../../recipes/loadRecipes';
import { createTestDb } from '../support/testDb';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('id'),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
}));

jest.mock('expo-keep-awake', () => ({
  useKeepAwake: jest.fn(),
}));

function recipe(overrides: Partial<EnrichedRecipe> = {}): EnrichedRecipe {
  return {
    id: 1,
    shareId: 'share-1',
    name: 'Thai Green Curry',
    description: null,
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
    tags: [],
    ingredients: [],
    steps: [
      { id: 2, phase: 'cook', instruction: 'Fry the paste', durationSeconds: 120, startOffsetSeconds: 0, effort: 'active', important: false, laneName: null },
      { id: 3, phase: 'cook', instruction: 'Simmer', durationSeconds: 600, startOffsetSeconds: 120, effort: 'passive', important: true, laneName: null },
    ],
    activeSeconds: 120,
    passiveSeconds: 600,
    totalSeconds: 720,
    durationBucket: '20to40',
    kcalPerServing: null,
    proteinPerServing: null,
    carbsPerServing: null,
    fatPerServing: null,
    costPerServing: null,
    macroCompleteCount: 0,
    costCompleteCount: 0,
    totalIngredientCount: 0,
    timesCooked: 0,
    avgRating: null,
    lastCookedAt: null,
    isFavourite: false,
    exclusion: null,
    hasStaleCost: false,
    logNotes: [],
    ...overrides,
  };
}

describe('CookingModeScreen (§5.6, §11.2 snapshot suite)', () => {
  it('renders the running cook phase after auto-starting a session (no timed prep, no unfinished session)', async () => {
    const db = await createTestDb();
    const recipeRow = await db.runAsync(
      `INSERT INTO recipe (share_id, name, photo_emoji, base_servings, timeline_mode, source) VALUES ('share-1', 'Thai Green Curry', '🍛', 2, 'sequential', 'manual')`,
    );
    const recipeId = recipeRow.lastInsertRowId;
    const step1 = await db.runAsync(
      `INSERT INTO recipe_step (recipe_id, phase, instruction, duration_seconds, effort, sort_order) VALUES (?, 'cook', 'Fry the paste', 120, 'active', 0)`,
      [recipeId],
    );
    const step2 = await db.runAsync(
      `INSERT INTO recipe_step (recipe_id, phase, instruction, duration_seconds, effort, important, sort_order) VALUES (?, 'cook', 'Simmer', 600, 'passive', 1, 1)`,
      [recipeId],
    );

    const result = await render(
      <SafeAreaProvider>
        <DbProvider db={db}>
          <CookingModeScreen
            recipe={recipe({
              id: recipeId,
              steps: [
                { id: step1.lastInsertRowId, phase: 'cook', instruction: 'Fry the paste', durationSeconds: 120, startOffsetSeconds: 0, effort: 'active', important: false, laneName: null },
                { id: step2.lastInsertRowId, phase: 'cook', instruction: 'Simmer', durationSeconds: 600, startOffsetSeconds: 120, effort: 'passive', important: true, laneName: null },
              ],
            })}
            onExit={() => {}}
            onComplete={() => {}}
          />
        </DbProvider>
      </SafeAreaProvider>,
    );

    await waitFor(() => expect(JSON.stringify(result.toJSON())).toContain('Fry the paste'));
    expect(result.toJSON()).toMatchSnapshot();
  });
});
