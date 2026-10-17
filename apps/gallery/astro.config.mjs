// @ts-check
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import { protoyardRegistry } from './src/integrations/registry-plugin.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, '../..');

// The gallery is a static site. It reads ONLY the generated metadata registry
// (`.protoyard/registry.json`, or PROTOYARD_REGISTRY for benchmarks and
// showcase builds) through a virtual module, and never imports prototype code.
// Manifest thumbnails are copied as plain files.
export default defineConfig({
  // Hosting the gallery under a sub-path: GALLERY_BASE=/protoyard/ pnpm build
  base: process.env.GALLERY_BASE ?? '/',
  ...(process.env.GALLERY_SITE ? { site: process.env.GALLERY_SITE } : {}),
  trailingSlash: 'ignore',
  // Separate caches let a showcase build run while the regular gallery builds
  // (e.g. two Playwright webServers): they must not share .astro / Vite caches.
  ...(process.env.PROTOYARD_GALLERY_CACHE_DIR
    ? { cacheDir: resolve(process.env.PROTOYARD_GALLERY_CACHE_DIR, 'astro') }
    : {}),
  compressHTML: true,
  integrations: [
    svelte(),
    protoyardRegistry({
      registryPath: process.env.PROTOYARD_REGISTRY
        ? resolve(process.cwd(), process.env.PROTOYARD_REGISTRY)
        : resolve(workspaceRoot, '.protoyard/registry.json'),
    }),
  ],
  server: { host: '127.0.0.1', port: 4321 },
  vite: {
    ...(process.env.PROTOYARD_GALLERY_CACHE_DIR
      ? { cacheDir: resolve(process.env.PROTOYARD_GALLERY_CACHE_DIR, 'vite') }
      : {}),
    plugins: [tailwindcss()],
    resolve: {
      alias: { '@': resolve(__dirname, './src') },
    },
    server: {
      watch: {
        // Prototype sources are irrelevant to the gallery; only the registry is watched.
        ignored: [
          '**/prototypes/**',
          '**/templates/**',
          '**/artifacts/**',
          '**/tmp/**',
          '**/.dwp/**',
        ],
      },
    },
  },
});
