import { render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ThemeProvider, useTheme } from '../../theme/ThemeContext';
import type { DbClient } from '../../db/DbClient';

function Probe() {
  const theme = useTheme();
  return <Text>{`${theme.id}|${theme.mode}`}</Text>;
}

function treeText(result: { toJSON: () => unknown }): string {
  return JSON.stringify(result.toJSON());
}

// A minimal in-memory setting store — enough for the provider's read path,
// without pulling a native SQLite build into the jest environment.
function fakeDb(initial: Record<string, string> = {}): DbClient {
  const store = { ...initial };
  return {
    async execAsync() {},
    async runAsync() {
      return { lastInsertRowId: 0, changes: 0 };
    },
    async getFirstAsync<T>(_sql: string, params?: unknown) {
      const key = Array.isArray(params) ? (params[0] as string) : undefined;
      const value = key ? store[key] : undefined;
      return value != null ? ({ value } as unknown as T) : null;
    },
    async getAllAsync<T>() {
      return [] as T[];
    },
  };
}

describe('ThemeProvider (§4.1)', () => {
  it('defaults to Hearth (light) with no provider', async () => {
    const result = await render(<Probe />);
    expect(treeText(result)).toContain('hearth|light');
  });

  it('loads the persisted theme from settings', async () => {
    const result = await render(
      <ThemeProvider db={fakeDb({ theme: 'dusk' })}>
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(treeText(result)).toContain('dusk|dark'));
  });

  it('overrideThemeId wins over any persisted value (picker preview)', async () => {
    const result = await render(
      <ThemeProvider db={fakeDb({ theme: 'dusk' })} overrideThemeId="midnightKitchen">
        <Probe />
      </ThemeProvider>,
    );
    expect(treeText(result)).toContain('midnightKitchen|dark');
  });
});
