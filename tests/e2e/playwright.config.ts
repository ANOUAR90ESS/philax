import { defineConfig, devices } from '@playwright/test';

const chromium =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.e2e\.ts/,
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    launchOptions: { executablePath: chromium },
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath: chromium } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions: { executablePath: chromium } } },
  ],
  webServer: [
    {
      command: 'pnpm exec tsx e2e/server.ts',
      cwd: '..',
      url: 'http://127.0.0.1:4100/api/health',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @philax/web exec vite --port 5174 --strictPort',
      cwd: '../..',
      url: 'http://localhost:5174',
      env: { VITE_API_URL: 'http://localhost:4100' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
