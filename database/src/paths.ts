import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const MIGRATIONS_DIR = join(root, 'migrations');
export const SEEDS_DIR = join(root, 'seeds');
