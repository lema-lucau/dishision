// Snapshot suite only (*.test.tsx), all under src/test/.
// Logic and DB tests run under Vitest — see vitest.config.ts.
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/src/test/**/*.test.tsx'],
  setupFiles: ['<rootDir>/node_modules/react-native-safe-area-context/jest/mock.tsx'],
};
