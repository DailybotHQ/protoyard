/// <reference path="./env.d.ts" />

/**
 * Reads the Vite-defined globals defensively: under Vitest (or any bundler
 * without `defineProtoyardConfig`) they are undeclared, and `typeof` keeps
 * that from throwing. In real builds the minifier folds these to constants,
 * so `if (DEVTOOLS_ENABLED)` tree-shakes the DevTools chunk away.
 */

export const DEVTOOLS_ENABLED: boolean =
  typeof __PROTOYARD_DEVTOOLS__ !== 'undefined' ? __PROTOYARD_DEVTOOLS__ : false;

export const DEMO_BADGE_ENABLED: boolean =
  typeof __PROTOYARD_DEMO_BADGE__ !== 'undefined' ? __PROTOYARD_DEMO_BADGE__ : false;

export const BUILD_INFO: typeof __PROTOYARD_BUILD__ | null =
  typeof __PROTOYARD_BUILD__ !== 'undefined' ? __PROTOYARD_BUILD__ : null;
