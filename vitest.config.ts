import { defineConfig } from 'vitest/config';

// Vitest owns pure logic + SQLite integration tests (*.test.ts), all under
// src/test/. React Native component snapshots live in *.test.tsx there too
// but run under jest-expo instead, because Vitest cannot drive the RN
// renderer (§11.1).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/test/**/*.test.ts'],
    exclude: ['node_modules', 'src/test/**/*.test.tsx'],
  },
});
