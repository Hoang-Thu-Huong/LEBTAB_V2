import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// root = Repo-Wurzel, damit auch frontend/js/**/*.test.js gefunden wird (docs/ARCHITECTURE.md 8.3).
export default defineConfig({
  root: REPO_ROOT,
  test: {
    environment: 'node',
    include: ['backend/src/**/*.test.js', 'frontend/js/**/*.test.js'],
    testTimeout: 10000,
  },
});
