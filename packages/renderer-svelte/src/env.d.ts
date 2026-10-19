/**
 * Compile-time globals injected by `defineProtoyardConfig` (Vite `define`).
 * Prototypes get these types by referencing `@protoyard/renderer-svelte/env`.
 */
declare const __PROTOYARD_DEVTOOLS__: boolean;
declare const __PROTOYARD_DEMO_BADGE__: boolean;
declare const __PROTOYARD_BUILD__: {
  id: string;
  slug: string;
  version: string;
  namespace: string;
  builtAt: string;
  mode: 'dev' | 'build';
  offline: boolean;
  /** Keep an explicit shell frame when embedded (absent in builds before ADR-026). */
  frameWhenEmbedded?: boolean;
};
/**
 * Where avatar images are served from and which sizes the build ships
 * (`sizes: []` when avatars are turned off). See src/avatars.ts.
 */
declare const __PROTOYARD_AVATARS__: { base: string; sizes: readonly (64 | 128)[] };
