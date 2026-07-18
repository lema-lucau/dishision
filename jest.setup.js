// Wires the library's own test double in so useSafeAreaInsets/useSafeAreaFrame
// resolve with a mock frame instead of waiting on a real native onLayout event
// that never fires under react-test-renderer.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
