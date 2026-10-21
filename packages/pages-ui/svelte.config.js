import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * svelte-package config (`pnpm build:packages`, ADR-028): the repository runs
 * from src/, and dist/ exists only for packing. Imports keep `.ts` in source;
 * tsconfig.build.json sets rewriteRelativeImportExtensions so dist imports
 * point at the emitted `.js`. The packaging temp folder stays git-ignored.
 */
export default {
  preprocess: vitePreprocess(),
  files: { lib: 'src' },
  outDir: 'node_modules/.svelte-package',
};
