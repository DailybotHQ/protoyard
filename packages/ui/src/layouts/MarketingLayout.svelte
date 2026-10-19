<script lang="ts">
import type { Snippet } from 'svelte';
import { cn } from '../lib/cn.ts';

interface Props {
  hero?: Snippet;
  /** LayoutHost integration; the stable routed screen is mounted in the main column. */
  mountScreen?: (target: HTMLElement) => void;
  brand?: Snippet;
  navigation?: Snippet;
  actions?: Snippet;
  sections?: Snippet;
  footer?: Snippet;
  class?: string;
}

let {
  hero,
  mountScreen,
  brand,
  navigation,
  actions,
  sections,
  footer,
  class: className,
}: Props = $props();
let screenTarget = $state<HTMLDivElement | undefined>();

$effect(() => {
  if (mountScreen && screenTarget) mountScreen(screenTarget);
});
</script>

<div class={cn('min-h-app bg-background text-foreground', className)} data-py-marketing-layout>
  <header class="border-b border-border bg-background/90 px-4 pt-safe backdrop-blur sm:px-6">
    <div class="mx-auto flex min-h-16 max-w-7xl items-center gap-6">
      <div class="shrink-0">{@render brand?.()}</div>
      <nav class="min-w-0 flex-1" aria-label="Main navigation">{@render navigation?.()}</nav>
      <div class="flex shrink-0 items-center gap-2">{@render actions?.()}</div>
    </div>
  </header>

  <main class="mx-auto flex w-full max-w-7xl flex-col px-4 sm:px-6">
    {#if hero}
      <section class="py-12 sm:py-20" aria-label="Introduction">{@render hero()}</section>
    {:else if mountScreen}
      <section class="min-w-0 py-8 sm:py-12" aria-label="Page content">
        <div bind:this={screenTarget} data-py-layout-screen-target></div>
      </section>
    {/if}
    {@render sections?.()}
  </main>

  {#if footer || !mountScreen}
    <footer class="mt-12 border-t border-border bg-muted/30 px-4 py-8 pb-safe sm:px-6">
      <div class="mx-auto max-w-7xl">{@render footer?.()}</div>
    </footer>
  {/if}
</div>
