import { defineProtoyardConfig } from '@protoyard/renderer-svelte/vite';

/**
 * The player builds like a prototype (Tailwind, avatars, DevTools, base `./`)
 * from its own protoyard.json, which only carries build settings: every
 * blueprint gets its manifest and storage namespace at runtime (ADR-029).
 */
export default defineProtoyardConfig({ root: import.meta.dirname });
