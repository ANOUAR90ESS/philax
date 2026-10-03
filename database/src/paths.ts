import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Overridable for bundled/containerized deployments where source-relative paths differ. */
export const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? join(root, 'migrations');
export const SEEDS_DIR = process.env.SEEDS_DIR ?? join(root, 'seeds');
