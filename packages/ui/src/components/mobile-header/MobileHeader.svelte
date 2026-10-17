<script lang="ts">
import { ChevronLeft } from '@lucide/svelte';
import type { Snippet } from 'svelte';
import { cn } from '../../lib/cn.ts';

interface Props {
  title: string;
  subtitle?: string;
  /** Element for the title; use `p`/`div` when the page renders its own `<h1>`. */
  titleAs?: 'h1' | 'h2' | 'p' | 'div';
  /** Back as a link (hash route) … */
  backHref?: string;
  /** … or as a callback. */
  onBack?: () => void;
  backLabel?: string;
  actions?: Snippet;
  sticky?: boolean;
  class?: string;
}

let {
  title,
  titleAs = 'h1',
  subtitle,
  backHref,
  onBack,
  backLabel = 'Back',
  actions,
  sticky = true,
  class: className,
}: Props = $props();

const backClass =
  '-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
</script>

<header
  class={cn(
    'z-30 flex min-h-14 items-center gap-1 border-b border-border bg-background/90 px-3 pt-safe backdrop-blur-md',
    sticky && 'sticky top-0',
    className
  )}
>
  {#if backHref}
    <a href={backHref} class={backClass} aria-label={backLabel}>
      <ChevronLeft class="size-6" aria-hidden="true" />
    </a>
  {:else if onBack}
    <button type="button" class={backClass} aria-label={backLabel} onclick={onBack}>
      <ChevronLeft class="size-6" aria-hidden="true" />
    </button>
  {/if}
  <div class={cn('min-w-0 flex-1 py-2', !backHref && !onBack && 'pl-1')}>
    <svelte:element this={titleAs} class="truncate font-heading text-base leading-tight font-semibold">{title}</svelte:element>
    {#if subtitle}<p class="truncate text-xs text-muted-foreground">{subtitle}</p>{/if}
  </div>
  {#if actions}<div class="flex shrink-0 items-center gap-1">{@render actions()}</div>{/if}
</header>
