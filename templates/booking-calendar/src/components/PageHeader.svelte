<script lang="ts">
import type { Snippet } from 'svelte';

let { title, description, actions }: { title: string; description?: string; actions?: Snippet } =
  $props();
</script>

<header class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
  <div class="min-w-0">
    <h1 class="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
    {#if description}
      <p class="mt-1 text-sm text-muted-foreground">{description}</p>
    {/if}
  </div>
  {#if actions}
    <div class="flex flex-wrap items-center gap-2">{@render actions()}</div>
  {/if}
</header>
