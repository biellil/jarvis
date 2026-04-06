import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: '.',
    environment: 'node', // Main/preload tests run in Node
    include: ['src/**/__tests__/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
  },
});
