<script lang="ts">
import { cn } from '../../lib/cn.ts';
import type { NavItem } from '../../lib/types.ts';

interface Props {
  items: NavItem[];
  label?: string;
  /** Pin to the viewport bottom (default). Disable when placing it inside a custom frame. */
  fixed?: boolean;
  class?: string;
}

let { items, label = 'Primary', fixed = true, class: className }: Props = $props();
</script>

<nav
  data-py-bottom-nav=""
  aria-label={label}
  class={cn(
    'z-40 border-t border-border bg-surface/95 pb-safe backdrop-blur-md px-safe',
    fixed && 'fixed inset-x-0 bottom-0',
    className
  )}
>
  <ul class="mx-auto flex max-w-lg items-stretch justify-around">
    {#each items as item (item.href + item.label)}
      <li class="flex flex-1">
        <a
          href={item.href}
          aria-current={item.active ? 'page' : undefined}
          class={cn(
            'relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-2 py-1.5 text-[0.7rem] font-medium text-muted-foreground transition-colors',
            'hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset',
            'aria-[current=page]:text-primary'
          )}
        >
          <span class="relative">
            {#if item.icon}<item.icon class="size-5" aria-hidden="true" />{/if}
            {#if item.badge !== undefined}
              <span
                class="absolute -top-1.5 left-3 min-w-4 rounded-full bg-destructive px-1 text-center text-[0.6rem] leading-4 font-semibold text-destructive-foreground tabular-nums"
              >
                {item.badge}
              </span>
            {/if}
          </span>
          <span class="max-w-full truncate">{item.label}</span>
        </a>
      </li>
    {/each}
  </ul>
</nav>
