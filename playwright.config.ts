import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  // Tests publics (e2e/) et tests privés sur la configuration réelle (private/e2e/, exclus de Git).
  testMatch: /(^|\/)(e2e|private\/e2e)\/.*\.spec\.ts$/,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/sesame/',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
  },
  projects: [{ name: 'iPhone 14', use: { ...devices['iPhone 14'] } }],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js preview --port 4173 --strictPort',
    url: 'http://localhost:4173/sesame/',
    reuseExistingServer: true,
  },
});
