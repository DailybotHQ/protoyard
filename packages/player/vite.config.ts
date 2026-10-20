import { defineProtoyardConfig } from '@protoyard/renderer-svelte/vite';

/**
 * The player builds like a prototype (Tailwind, avatars, DevTools, base `./`,
 * offline service worker) from its own protoyard.json, which only carries
 * build settings: every blueprint gets its manifest and storage namespace at
 * runtime (ADR-029). The `build.offline` flag is consumed by this shared
 * config factory, so the worker is build-only and never runs in `vite dev`.
 */
export default defineProtoyardConfig({ root: import.meta.dirname });
