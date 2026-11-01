import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const sharedDir = fileURLToPath(new URL('./shared', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@shared': sharedDir
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 180_000,
    pool: 'forks'
  }
});
