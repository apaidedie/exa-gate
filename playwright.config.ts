import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  timeout: 30_000,
  // The login + live-refresh flows have rare timing flakes on busy runners;
  // retry once in CI so a single hiccup does not fail the release build.
  retries: process.env.CI ? 1 : 0,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  outputDir: 'output/playwright/e2e'
});
