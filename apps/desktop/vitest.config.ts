import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    root: '.',
    environment: 'node', // Main/preload tests run in Node
    environmentMatchGlobs: [
      ['**/src/renderer/**', 'happy-dom'], // renderer tests use happy-dom
    ],
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.tsx', 'test/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    setupFiles: ['./src/renderer/__tests__/setup.ts'],
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, './src/renderer'),
    },
  },
});
