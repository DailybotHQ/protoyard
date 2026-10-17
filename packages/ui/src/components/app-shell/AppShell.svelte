<script lang="ts">
import { X } from '@lucide/svelte';
import { Dialog as DialogPrimitive } from 'bits-ui';
import type { Snippet } from 'svelte';
import { cn } from '../../lib/cn.ts';
import { overlayBackdrop } from '../../lib/overlay.ts';
import { setAppShellContext } from './context.ts';
import DrawerScope from './DrawerScope.svelte';

interface Props {
  /** Usually a `<Sidebar>`; rendered inline on large screens and in a drawer below `lg`. */
  sidebar?: Snippet;
  /** Usually a `<Header>`; its menu button opens the mobile drawer automatically. */
  header?: Snippet;
  /** Mobile-only bottom navigation (e.g. `<BottomNav>`), hidden on large screens. */
  bottomNav?: Snippet;
  children: Snippet;
  /** Mobile drawer state. */
  sidebarOpen?: boolean;
  sidebarLabel?: string;
  class?: string;
  mainClass?: string;
  mainId?: string;
  /** Classes for the desktop sidebar column (default height is the viewport). */
  sidebarClass?: string;
  /** Use `div` for a shell nested inside another page's `<main>` (demos, previews). */
  mainElement?: 'main' | 'div';
}

let {
  sidebar,
  header,
  bottomNav,
  children,
  sidebarOpen = $bindable(false),
  sidebarLabel = 'Navigation',
  class: className,
  mainClass,
  mainId = 'main-content',
  sidebarClass,
  mainElement = 'main',
}: Props = $props();

// The drawer only exists below `lg`; opening it on a wide screen would trap
// focus in an invisible modal, so it closes as soon as the layout is wide.
$effect(() => {
  if (!sidebarOpen || typeof matchMedia !== 'function') return;
  const wide = matchMedia('(min-width: 64rem)');
  const sync = () => {
    if (wide.matches) sidebarOpen = false;
  };
  sync();
  wide.addEventListener?.('change', sync);
  return () => wide.removeEventListener?.('change', sync);
});

setAppShellContext({
  get sidebarOpen() {
    return sidebarOpen;
  },
  openSidebar: () => {
    sidebarOpen = true;
  },
  closeSidebar: () => {
    sidebarOpen = false;
  },
  toggleSidebar: () => {
    sidebarOpen = !sidebarOpen;
  },
});

function closeOnNavigate(event: MouseEvent): void {
  // Following a link inside the drawer should reveal the new screen, not keep the drawer up.
  if (event.target instanceof Element && event.target.closest('a[href]')) sidebarOpen = false;
}
</script>

<div class={cn('flex min-h-dvh bg-background text-foreground', className)}>
  <a
    href={`#${mainId}`}
    class="sr-only z-[70] rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    onclick={(event) => {
      // Hash routers would treat "#main-content" as a route, so move focus manually instead.
      event.preventDefault();
      document.getElementById(mainId)?.focus();
    }}
  >
    Skip to content
  </a>

  {#if sidebar}
    <!-- A landmark, so brand/footer content beside the <nav> is not orphaned —
         except when nested in another page's <main> (landmarks must be top level). -->
    <svelte:element
      this={mainElement === 'main' ? 'aside' : 'div'}
      aria-label={mainElement === 'main' ? sidebarLabel : undefined}
      class={cn('sticky top-0 hidden h-dvh shrink-0 lg:flex', sidebarClass)}
    >
      {@render sidebar()}
    </svelte:element>

    <DialogPrimitive.Root bind:open={sidebarOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay class={cn(overlayBackdrop, 'lg:hidden')} />
        <DialogPrimitive.Content
          class="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-sidebar text-sidebar-foreground shadow-float outline-none ui-anim-drawer lg:hidden"
        >
          <DialogPrimitive.Title class="sr-only">{sidebarLabel}</DialogPrimitive.Title>
          <DialogPrimitive.Close
            class="absolute top-[max(0.5rem,env(safe-area-inset-top))] right-2 z-10 inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <X class="size-5" aria-hidden="true" />
            <span class="sr-only">Close navigation</span>
          </DialogPrimitive.Close>
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div class="flex min-h-0 flex-1 pt-safe pb-safe" onclick={closeOnNavigate}>
            <DrawerScope>{@render sidebar()}</DrawerScope>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  {/if}

  <div class="flex min-w-0 flex-1 flex-col">
    {@render header?.()}
    <svelte:element
      this={mainElement}
      id={mainId}
      tabindex="-1"
      class={cn('flex-1 outline-none', bottomNav && 'pb-20 lg:pb-0', mainClass)}
    >
      {@render children()}
    </svelte:element>
    {#if bottomNav}<div class="lg:hidden">{@render bottomNav()}</div>{/if}
  </div>
</div>
