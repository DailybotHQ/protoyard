<script lang="ts">
import { ChevronRight } from '@lucide/svelte';
import { cn } from '../../lib/cn.ts';
import type { BreadcrumbItem } from './types.ts';

interface Props {
  items: BreadcrumbItem[];
  label?: string;
  class?: string;
}

let { items, label = 'Breadcrumb', class: className }: Props = $props();
</script>

<nav aria-label={label} class={cn('min-w-0', className)}>
  <ol class="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
    {#each items as item, index (index)}
      {@const isLast = index === items.length - 1}
      <li class="inline-flex min-w-0 items-center gap-1.5">
        {#if item.href && !isLast}
          <a
            href={item.href}
            class="truncate rounded-sm transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {item.label}
          </a>
        {:else}
          <span class={cn('truncate', isLast && 'font-medium text-foreground')} aria-current={isLast ? 'page' : undefined}>
            {item.label}
          </span>
        {/if}
        {#if !isLast}<ChevronRight class="size-3.5 shrink-0" aria-hidden="true" />{/if}
      </li>
    {/each}
  </ol>
</nav>
