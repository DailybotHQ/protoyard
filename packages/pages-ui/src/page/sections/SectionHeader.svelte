<script lang="ts">
import type { HeadingBlock } from '@protoyard/blocks';

/** A section's opening heading at the marketing scale: eyebrow, title, lead. */
let { heading, inverted = false }: { heading: HeadingBlock; inverted?: boolean } = $props();
const level = $derived(Math.min(4, Math.max(2, heading.level ?? 2)));
const centered = $derived(heading.align !== 'start');
</script>

<header
  class="grid max-w-3xl gap-4 {centered ? 'mx-auto justify-items-center text-center' : ''}"
  data-py-page-section-header
>
  {#if heading.eyebrow}
    <p class="text-sm font-semibold tracking-wide uppercase {inverted ? 'text-primary-foreground' : 'text-primary'}">
      {heading.eyebrow}
    </p>
  {/if}
  <svelte:element
    this={`h${level}`}
    id={heading.id}
    class="font-heading text-3xl font-bold tracking-tight text-balance sm:text-4xl {inverted ? 'text-primary-foreground' : 'text-foreground'}"
  >
    {heading.text}
  </svelte:element>
  {#if heading.subtitle}
    <p class="text-lg text-pretty {inverted ? 'text-primary-foreground' : 'text-muted-foreground'}">
      {heading.subtitle}
    </p>
  {/if}
</header>
