import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  files: { lib: 'src' },
  outDir: 'node_modules/.svelte-package',
};
