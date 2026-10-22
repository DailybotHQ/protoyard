import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** Package source stays in src/; svelte-package creates dist only for release. */
export default {
  preprocess: vitePreprocess(),
  files: { lib: 'src' },
  outDir: 'node_modules/.svelte-package',
};
