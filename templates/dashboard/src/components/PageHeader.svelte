<script lang="ts">
import { CardDescription } from '@protoyard/ui';
import type { Snippet } from 'svelte';

/**
 * The page title row. The description is Texuli's muted description text.
 * The title keeps typography utilities until the design system has a heading
 * component (locked mode reports them as ds-utility).
 */
let { title, description, actions }: { title: string; description?: string; actions?: Snippet } =
  $props();
</script>

<header class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
  <div class="min-w-0">
    <h1 class="text-2xl font-semibold tracking-tight">{title}</h1>
    {#if description}
      <CardDescription class="mt-1">{description}</CardDescription>
    {/if}
  </div>
  {#if actions}
    <div class="flex flex-wrap items-center gap-2">{@render actions()}</div>
  {/if}
</header>
