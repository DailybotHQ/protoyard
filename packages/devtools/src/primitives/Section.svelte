<script lang="ts">
import type { Snippet } from 'svelte';

let {
  title,
  description,
  actions,
  children,
}: { title: string; description?: string; actions?: Snippet; children: Snippet } = $props();
</script>

<section class="border-b border-border px-4 py-3.5 last:border-b-0">
  <div class="mb-2.5 flex items-start justify-between gap-3">
    <div class="min-w-0">
      <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {#if description}
        <p class="mt-0.5 text-xs text-muted-foreground">{description}</p>
      {/if}
    </div>
    {#if actions}
      <div class="flex shrink-0 items-center gap-1.5">{@render actions()}</div>
    {/if}
  </div>
  {@render children()}
</section>
