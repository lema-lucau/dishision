import { fireEvent, render, waitFor } from '@testing-library/react-native';
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
    householdRatings: [],
    ...overrides,
  };
}

async function seedRecipe(db: Awaited<ReturnType<typeof createTestDb>>, lanes: (string | null)[]) {
  const recipeRow = await db.runAsync(
    `INSERT INTO recipe (share_id, name, photo_emoji, base_servings, timeline_mode, source) VALUES ('share-1', 'Thai Green Curry', '🍛', 2, 'parallel', 'manual')`,
  );
  const recipeId = recipeRow.lastInsertRowId;
  const laneIds = new Map<string, number>();
  for (const [i, lane] of lanes.entries()) {
    if (lane && !laneIds.has(lane)) {
      const row = await db.runAsync('INSERT INTO step_lane (recipe_id, name, sort_order) VALUES (?, ?, ?)', [
        recipeId,
        lane,
        i,
      ]);
      laneIds.set(lane, row.lastInsertRowId);
    }
  }
  const stepIds: number[] = [];
  for (const [i, lane] of lanes.entries()) {
    const row = await db.runAsync(
      `INSERT INTO recipe_step (recipe_id, lane_id, phase, instruction, duration_seconds, effort, sort_order) VALUES (?, ?, 'cook', ?, ?, 'active', ?)`,
      [recipeId, lane ? laneIds.get(lane)! : null, `Step ${i + 1}`, 120 + i * 60, i],
    );
    stepIds.push(row.lastInsertRowId);
  }
  return { recipeId, stepIds };
}

describe('CookingModeScreen (§5.6, §11.2 snapshot suite)', () => {
  it('opens in the ready state — clock at zero, Start cooking as the gate', async () => {
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

    await waitFor(() => expect(result.getByTestId('start-cooking')).toBeTruthy());
    expect(JSON.stringify(result.toJSON())).toContain('Fry the paste');
    // A single-lane recipe gets no tab strip — tabs are for parallel cooking.
    expect(result.queryByTestId('lane-tabs')).toBeNull();
    expect(result.toJSON()).toMatchSnapshot();
  });

  it('starts the clock only when Start cooking is tapped', async () => {
    const db = await createTestDb();
    const { recipeId, stepIds } = await seedRecipe(db, [null, null]);

    const result = await render(
      <SafeAreaProvider>
        <DbProvider db={db}>
          <CookingModeScreen
            recipe={recipe({
              id: recipeId,
              steps: stepIds.map((id, i) => ({
                id,
                phase: 'cook' as const,
                instruction: `Step ${i + 1}`,
                durationSeconds: 120 + i * 60,
                startOffsetSeconds: i * 120,
                effort: 'active' as const,
                important: false,
                laneName: null,
              })),
            })}
            onExit={() => {}}
            onComplete={() => {}}
          />
        </DbProvider>
      </SafeAreaProvider>,
    );

    await waitFor(() => expect(result.getByTestId('start-cooking')).toBeTruthy());
    const before = await db.getFirstAsync<{ paused_at: string | null }>('SELECT paused_at FROM cooking_session');
    expect(before?.paused_at).not.toBeNull();

    fireEvent.press(result.getByTestId('start-cooking'));

    await waitFor(async () => {
      const after = await db.getFirstAsync<{ paused_at: string | null }>('SELECT paused_at FROM cooking_session');
      expect(after?.paused_at).toBeNull();
    });
    // Once running, the gate is gone and the cook controls take over.
    await waitFor(() => expect(result.queryByTestId('start-cooking')).toBeNull());
    expect(result.getByTestId('pause-toggle')).toBeTruthy();
  });

  it('→ past the live step commits instantly with no confirm (§C2/§C5)', async () => {
    const db = await createTestDb();
    const { recipeId, stepIds } = await seedRecipe(db, [null, null]);

    const result = await render(
      <SafeAreaProvider>
        <DbProvider db={db}>
          <CookingModeScreen
            recipe={recipe({
              id: recipeId,
              steps: stepIds.map((id, i) => ({
                id,
                phase: 'cook' as const,
                instruction: `Step ${i + 1}`,
                durationSeconds: 600,
                startOffsetSeconds: i * 600,
                effort: 'active' as const,
                important: false,
                laneName: null,
              })),
            })}
            onExit={() => {}}
            onComplete={() => {}}
          />
        </DbProvider>
      </SafeAreaProvider>,
    );

    await waitFor(() => expect(result.getByTestId('start-cooking')).toBeTruthy());
    fireEvent.press(result.getByTestId('start-cooking'));
    await waitFor(() => expect(result.getByTestId('step-forward')).toBeTruthy());

    // The blocking "Move on to the next step?" confirm is gone — the arrow
    // completes the current step and advances immediately.
    fireEvent.press(result.getByTestId('step-forward'));
    await waitFor(async () => {
      const moved = await db.getFirstAsync<{ current_step_id: number }>('SELECT current_step_id FROM cooking_session');
      expect(moved?.current_step_id).toBe(stepIds[1]);
    });
    expect(result.queryByText('Move on to the next step?')).toBeNull();
    const completed = await db.getFirstAsync<{ completed_at: string | null }>(
      'SELECT completed_at FROM cooking_session_step WHERE step_id = ?',
      [stepIds[0]],
    );
    expect(completed?.completed_at).not.toBeNull();

    // Recovery: peek ← back to the completed step and reset its timer.
    fireEvent.press(result.getByTestId('step-back'));
    await waitFor(() => expect(result.getByTestId('reset-step-timer')).toBeTruthy());
    fireEvent.press(result.getByTestId('reset-step-timer'));
    await waitFor(() => expect(result.getByText("Reset this step's timer?")).toBeTruthy());
    fireEvent.press(result.getByText('Reset timer'));
    await waitFor(async () => {
      const back = await db.getFirstAsync<{ current_step_id: number }>('SELECT current_step_id FROM cooking_session');
      expect(back?.current_step_id).toBe(stepIds[0]);
    });
  });

  it('shows one tab per lane on a parallel recipe, and pins the lane the cook picks', async () => {
    const db = await createTestDb();
    const { recipeId, stepIds } = await seedRecipe(db, ['Curry', 'Rice', 'Curry']);
    const laneNames = ['Curry', 'Rice', 'Curry'];

    const result = await render(
      <SafeAreaProvider>
        <DbProvider db={db}>
          <CookingModeScreen
            recipe={recipe({
              id: recipeId,
              timelineMode: 'parallel',
              steps: stepIds.map((id, i) => ({
                id,
                phase: 'cook' as const,
                instruction: `Step ${i + 1}`,
                durationSeconds: 120 + i * 60,
                startOffsetSeconds: i * 120,
                effort: 'active' as const,
                important: false,
                laneName: laneNames[i],
              })),
            })}
            onExit={() => {}}
            onComplete={() => {}}
          />
        </DbProvider>
      </SafeAreaProvider>,
    );

    await waitFor(() => expect(result.getByTestId('lane-tabs')).toBeTruthy());
    expect(result.getByTestId('lane-tab-Curry')).toBeTruthy();
    expect(result.getByTestId('lane-tab-Rice')).toBeTruthy();
    expect(result.toJSON()).toMatchSnapshot();

    // Picking a lane shows that lane's first step.
    fireEvent.press(result.getByTestId('lane-tab-Rice'));
    await waitFor(() => expect(JSON.stringify(result.toJSON())).toContain('Step 2'));
  });
});
