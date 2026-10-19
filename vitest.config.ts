import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

// One root config for every unit/integration test in the workspace.
// IndexedDB is provided by fake-indexeddb; each test file gets a fresh
// happy-dom environment, so no test touches a developer's real browser DB.
export default defineConfig({
  plugins: [svelte()],
  resolve: {
    conditions: ['browser'],
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./tests/setup/vitest.setup.ts'],
    include: [
      'packages/*/tests/**/*.test.ts',
      'apps/*/tests/**/*.test.ts',
      'templates/*/tests/**/*.test.ts',
      'prototypes/*/tests/**/*.test.ts',
      'tests/unit/**/*.test.ts',
      'tests/scripts/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
    // These ship raw .svelte files; Vitest must transform them, not externalize.
    server: { deps: { inline: [/@lucide\/svelte/, /bits-ui/, /svelte-toolbelt/, /runed/] } },
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**'],
      reporter: ['text', 'html'],
    },
  },
});
