import { defineConfig } from 'tsup';

// Bundles the API and all internal workspace packages into dist/; third-party
// dependencies stay external and are installed in production.
export default defineConfig({
  entry: ['src/main.ts', 'src/ops.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: [/^@philax\//],
});
