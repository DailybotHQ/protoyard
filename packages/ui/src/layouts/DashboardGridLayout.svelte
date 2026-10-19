<script lang="ts">
import type { Snippet } from 'svelte';

interface Props {
  children?: Snippet;
  /** LayoutHost integration; the stable routed screen is mounted in the grid. */
  mountScreen?: (target: HTMLElement) => void;
  class?: string;
  gap?: string;
}

let { children, mountScreen, class: className, gap = '1rem' }: Props = $props();
let screenTarget = $state<HTMLDivElement | undefined>();

$effect(() => {
  if (mountScreen && screenTarget) mountScreen(screenTarget);
});
</script>

<div class="dashboard-grid-container @container min-w-0 {className ?? ''}" data-py-dashboard-grid>
  <div class="dashboard-grid" style={`--py-dashboard-grid-gap: ${gap}`}>
    {#if children}
      {@render children()}
    {:else if mountScreen}
      <div bind:this={screenTarget} class="min-w-0" data-py-layout-screen-target></div>
    {/if}
  </div>
</div>

<style>
  .dashboard-grid-container {
    min-width: 0;
    container-type: inline-size;
  }

  .dashboard-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: var(--py-dashboard-grid-gap, 1rem);
    container-type: inline-size;
  }

  .dashboard-grid > :global(*) {
    min-width: 0;
    grid-column: span 1;
  }

  @container (min-width: 36rem) {
    .dashboard-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .dashboard-grid > :global([data-span='2']),
    .dashboard-grid > :global([data-span='3']),
    .dashboard-grid > :global([data-span='4']) {
      grid-column: span 2;
    }
  }

  @container (min-width: 56rem) {
    .dashboard-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .dashboard-grid > :global([data-span='3']),
    .dashboard-grid > :global([data-span='4']) {
      grid-column: span 3;
    }
  }

  @container (min-width: 72rem) {
    .dashboard-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .dashboard-grid > :global([data-span='2']) {
      grid-column: span 2;
    }

    .dashboard-grid > :global([data-span='3']) {
      grid-column: span 3;
    }

    .dashboard-grid > :global([data-span='4']) {
      grid-column: span 4;
    }
  }
</style>
