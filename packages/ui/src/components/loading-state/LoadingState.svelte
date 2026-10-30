<script lang="ts">
import type { HTMLAttributes } from 'svelte/elements';
import { Skeleton } from 'texuli/feedback';
import { cn } from '../../lib/cn.ts';
import Spinner from '../spinner/Spinner.svelte';

type Props = HTMLAttributes<HTMLDivElement> & {
  label?: string;
  variant?: 'spinner' | 'skeleton';
  /** Skeleton line count. */
  rows?: number;
  /** The rendered root element (bindable). */
  ref?: HTMLElement | null;
};

let {
  label = 'Loading…',
  variant = 'spinner',
  rows = 3,
  class: className,
  ref = $bindable(null),
  ...rest
}: Props = $props();
</script>

<div bind:this={ref} role="status" aria-live="polite" class={cn('w-full', className)} {...rest}>
  {#if variant === 'skeleton'}
    <span class="sr-only">{label}</span>
    <div class="grid gap-3 py-2">
      {#each { length: rows }, index (index)}
        <Skeleton class={cn('h-4', index === rows - 1 ? 'w-2/3' : 'w-full')} />
      {/each}
    </div>
  {:else}
    <div class="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
      <Spinner class="size-5" />
      <span>{label}</span>
    </div>
  {/if}
</div>
