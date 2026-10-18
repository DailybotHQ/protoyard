<script lang="ts">
import type { Snippet } from 'svelte';
import { cn } from '../../lib/cn.ts';

interface Props {
  /** Usually a `<MobileHeader>`; remains outside the scroll region. */
  header?: Snippet;
  /** Bottom navigation rendered in normal flow; use `<BottomNav fixed={false}>`. */
  bottomNav?: Snippet;
  /** Screen-level action area between the scroll region and bottom navigation. */
  stickyFooter?: Snippet;
  children: Snippet;
  class?: string;
  mainClass?: string;
  mainId?: string;
}

let {
  header,
  bottomNav,
  stickyFooter,
  children,
  class: className,
  mainClass,
  mainId = 'mobile-app-content',
}: Props = $props();

let mainElement: HTMLElement;

$effect(() => {
  const resetScroll = () => {
    mainElement.scrollTop = 0;
  };
  window.addEventListener('hashchange', resetScroll);
  return () => window.removeEventListener('hashchange', resetScroll);
});
</script>

<div class={cn('flex h-app min-h-0 flex-col overflow-hidden bg-background text-foreground', className)}>
  <a
    href={`#${mainId}`}
    class="sr-only z-[70] rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    onclick={(event) => {
      event.preventDefault();
      mainElement.focus();
    }}
  >
    Skip to content
  </a>

  {@render header?.()}
  <main
    bind:this={mainElement}
    id={mainId}
    tabindex="-1"
    class={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none', mainClass)}
  >
    {@render children()}
  </main>
  {@render stickyFooter?.()}
  {@render bottomNav?.()}
</div>
