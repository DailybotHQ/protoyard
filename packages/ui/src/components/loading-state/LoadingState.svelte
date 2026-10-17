<script lang="ts">
import type { HTMLAttributes } from 'svelte/elements';
import { cn } from '../../lib/cn.ts';
import Skeleton from '../skeleton/Skeleton.svelte';
import Spinner from '../spinner/Spinner.svelte';

type Props = HTMLAttributes<HTMLDivElement> & {
  label?: string;
  variant?: 'spinner' | 'skeleton';
  /** Skeleton line count. */
  rows?: number;
};

let {
  label = 'Loading…',
  variant = 'spinner',
  rows = 3,
  class: className,
  ...rest
}: Props = $props();
</script>

<div role="status" aria-live="polite" class={cn('w-full', className)} {...rest}>
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
