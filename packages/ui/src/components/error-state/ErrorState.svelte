<script lang="ts">
import { CircleAlert, RefreshCw } from '@lucide/svelte';
import type { Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';
import { cn } from '../../lib/cn.ts';
import Button from '../button/Button.svelte';

type Props = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  title?: string;
  message?: string;
  /** Shows a retry button; may be async (the button spins until it settles). */
  onRetry?: () => void | Promise<void>;
  retryLabel?: string;
  /** Extra actions next to retry. */
  action?: Snippet;
};

let {
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
  action,
  class: className,
  ...rest
}: Props = $props();

let retrying = $state(false);

async function retry(): Promise<void> {
  if (!onRetry) return;
  retrying = true;
  try {
    await onRetry();
  } finally {
    retrying = false;
  }
}
</script>

<div
  role="alert"
  class={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}
  {...rest}
>
  <div
    class="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"
    aria-hidden="true"
  >
    <CircleAlert class="size-6" />
  </div>
  <div class="grid max-w-sm gap-1">
    <p class="font-heading text-base font-semibold text-foreground">{title}</p>
    {#if message}<p class="text-sm text-muted-foreground">{message}</p>{/if}
  </div>
  {#if onRetry || action}
    <div class="mt-2 flex flex-wrap justify-center gap-2">
      {#if onRetry}
        <Button variant="outline" loading={retrying} onclick={retry}>
          {#if !retrying}<RefreshCw aria-hidden="true" />{/if}
          {retryLabel}
        </Button>
      {/if}
      {@render action?.()}
    </div>
  {/if}
</div>
