import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: [
            'packages/*/src/**/*.test.ts',
            'modules/*/src/**/*.test.ts',
            'database/src/**/*.test.ts',
            'apps/api/src/**/*.test.ts',
          ],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'web',
          include: ['apps/web/src/**/*.test.{ts,tsx}', 'packages/ui/src/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['apps/web/src/test-setup.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
          globalSetup: ['tests/support/global-setup.ts'],
        },
      },
    ],
  },
});
