import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Use a preinstalled Chromium when present (sandboxed dev environments); otherwise
// Playwright's own managed browser (CI runs `playwright install chromium`).
const preinstalled =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const launchOptions = existsSync(preinstalled) ? { executablePath: preinstalled } : {};

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
    launchOptions,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], launchOptions },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions } },
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
      // Production build + preview: what users get, and no dev-server dependency re-optimization reloads.
      command:
        'pnpm --filter @philax/web exec vite build && pnpm --filter @philax/web exec vite preview --port 5174 --strictPort',
      cwd: '../..',
      url: 'http://localhost:5174',
      env: { VITE_API_URL: 'http://localhost:4100' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
