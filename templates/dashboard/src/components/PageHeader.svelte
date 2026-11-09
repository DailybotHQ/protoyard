<script lang="ts">
import { CardDescription } from '@protoyard/ui';
import type { Snippet } from 'svelte';
import { Heading } from 'texuli/typography';

/**
 * The page title row: Texuli's Heading for the title and its muted
 * description text, so a locked design system keeps the hierarchy.
 */
let { title, description, actions }: { title: string; description?: string; actions?: Snippet } =
  $props();
</script>

<header class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
  <div class="min-w-0">
    <Heading level={1} size="xl">{title}</Heading>
    {#if description}
      <CardDescription class="mt-1">{description}</CardDescription>
    {/if}
  </div>
  {#if actions}
    <div class="flex flex-wrap items-center gap-2">{@render actions()}</div>
  {/if}
</header>
