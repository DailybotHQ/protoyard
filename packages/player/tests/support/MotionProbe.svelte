<script lang="ts">
import type { Component, Snippet } from 'svelte';
import { motionProbe } from './motion-probe.ts';

let {
  level,
  reducedMotion,
  children,
}: { level?: 'full' | 'subtle' | 'none'; reducedMotion?: boolean; children?: Snippet } = $props();
motionProbe.levels.push(level);
const Real = motionProbe.Real as unknown as Component<{
  level?: 'full' | 'subtle' | 'none';
  reducedMotion?: boolean;
  children?: Snippet;
}>;
</script>

<Real {level} {reducedMotion}>{@render children?.()}</Real>
