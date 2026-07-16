import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DebugScreen } from '../../debug/DebugScreen';
import { useLogStore } from '../../debug/logStore';

function renderDebugScreen() {
  return render(
    <SafeAreaProvider>
      <DebugScreen />
    </SafeAreaProvider>
  );
}

describe('DebugScreen', () => {
  beforeEach(() => {
    useLogStore.setState({ entries: [], nextId: 1 });
  });

  it('renders an empty log list', async () => {
    const result = await renderDebugScreen();
    expect(result.toJSON()).toMatchSnapshot();
  });

  it('renders logged entries newest-first', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T00:47:55.000Z'));
    useLogStore.getState().log('info', 'engine', 'Relaxed 5d -> 3d, 2 survivors', { window: 5 });
    useLogStore.getState().log('warn', 'pantry', 'Shortfall: chicken 300/400g');
    jest.useRealTimers();
    const result = await renderDebugScreen();
    expect(result.toJSON()).toMatchSnapshot();
  });
});
