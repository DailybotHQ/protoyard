<script lang="ts">
import { X } from '@lucide/svelte';
import { Dialog as DialogPrimitive } from 'bits-ui';
import type { Snippet } from 'svelte';
import DrawerScope from '../components/app-shell/DrawerScope.svelte';
import { overlayBackdrop } from '../lib/overlay.ts';
import { onNavigate } from './layout-kit.ts';

/*
 * The navigation drawer a layout shows below its breakpoint (the AppShell
 * drawer, driven by the layout instead of the viewport). Escape, the close
 * button, the backdrop, following a link and any in-app navigation close it;
 * Bits UI traps and restores focus.
 */
interface Props {
  open?: boolean;
  label: string;
  children: Snippet;
}

let { open = $bindable(false), label, children }: Props = $props();

$effect(() => {
  if (!open) return;
  return onNavigate(() => {
    open = false;
  });
});

function closeOnLink(event: MouseEvent): void {
  if (event.target instanceof Element && event.target.closest('a[href]')) open = false;
}
</script>

<DialogPrimitive.Root bind:open>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay class={overlayBackdrop} />
    <DialogPrimitive.Content
      class="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-sidebar text-sidebar-foreground shadow-float outline-none ui-anim-drawer"
      data-py-layout-drawer
    >
      <DialogPrimitive.Title class="sr-only">{label}</DialogPrimitive.Title>
      <DialogPrimitive.Close
        class="absolute top-[max(0.5rem,env(safe-area-inset-top))] right-2 z-10 inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <X class="size-5" aria-hidden="true" />
        <span class="sr-only">Close navigation</span>
      </DialogPrimitive.Close>
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="flex min-h-0 flex-1 flex-col pt-safe pb-safe" onclick={closeOnLink}>
        <DrawerScope>{@render children()}</DrawerScope>
      </div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>
