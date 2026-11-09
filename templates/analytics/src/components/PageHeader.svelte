<script lang="ts">
import type { Snippet } from 'svelte';
import { Heading, Text } from 'texuli/typography';

let { title, description, actions }: { title: string; description?: string; actions?: Snippet } =
  $props();
</script>

<header class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
  <div class="min-w-0">
    <Heading level={1} size="xl">{title}</Heading>
    {#if description}
      <Text size="sm" tone="muted" class="mt-1">{description}</Text>
    {/if}
  </div>
  {#if actions}
    <div class="flex flex-wrap items-center gap-2">{@render actions()}</div>
  {/if}
</header>
