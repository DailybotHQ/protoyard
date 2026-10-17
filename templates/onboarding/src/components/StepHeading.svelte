<script lang="ts">
import { onMount } from 'svelte';

/**
 * Step title that takes focus when the step appears, so keyboard and screen
 * reader users land on the new step after Next/Back (and after a reload).
 */
let {
  title,
  description,
  optional = false,
}: { title: string; description: string; optional?: boolean } = $props();
let heading = $state<HTMLHeadingElement | null>(null);
onMount(() => heading?.focus({ preventScroll: true }));
</script>

<header class="mb-6">
  <h1 bind:this={heading} tabindex="-1" class="text-xl font-semibold tracking-tight outline-none sm:text-2xl">
    {title}
    {#if optional}<span class="ml-1 align-middle text-xs font-medium text-muted-foreground">(optional)</span>{/if}
  </h1>
  <p class="mt-1 text-sm text-muted-foreground">{description}</p>
</header>
