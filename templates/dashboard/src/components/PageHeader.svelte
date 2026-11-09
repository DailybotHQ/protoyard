<script lang="ts">
import { CardDescription } from '@protoyard/ui';
import type { Snippet } from 'svelte';

/**
 * The page title row. Only layout classes here: the heading takes the theme's
 * heading font and weight, the description is Texuli's muted description text,
 * so a prototype locked to a design system renders it through its components.
 */
let { title, description, actions }: { title: string; description?: string; actions?: Snippet } =
  $props();
</script>

<header class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
  <div class="min-w-0">
    <h1>{title}</h1>
    {#if description}
      <CardDescription class="mt-1">{description}</CardDescription>
    {/if}
  </div>
  {#if actions}
    <div class="flex flex-wrap items-center gap-2">{@render actions()}</div>
  {/if}
</header>
