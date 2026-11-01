import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    ...(process.env.CI ? {} : { channel: 'chrome' as const })
  },
  webServer: {
    command: 'npx tsx tests/e2e/server.ts',
    url: 'http://127.0.0.1:3100/healthz',
    reuseExistingServer: false,
    timeout: 180_000
  }
});
