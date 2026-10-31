import type { Component } from 'svelte';

/**
 * Records the level every `MotionProvider` mounts with (tests mock
 * `texuli/motion` with `MotionProbe.svelte`, which renders the real provider).
 */
export const motionProbe: { levels: (string | undefined)[]; Real: Component<never> | null } = {
  levels: [],
  Real: null,
};
