import { defineConfig, devices } from '@playwright/test';

/**
 * Dashboard happy path against the running docker stack (docker compose up -d).
 * Needs SEED_PASSWORD and SEED_CHW_PIN from .env. Caddy's local certificate is
 * self-signed, hence ignoreHTTPSErrors.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://localhost',
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // NFR 5: Safari's engine. The happy path only; axe and throttling run in Chromium.
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testMatch: 'dentist.spec.ts' },
  ],
});
