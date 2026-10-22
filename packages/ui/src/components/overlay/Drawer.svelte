<script lang="ts">
import { X } from '@lucide/svelte';
import { Dialog as DialogPrimitive } from 'bits-ui';
import type { Snippet } from 'svelte';
import { cn } from '../../lib/cn.ts';
import { overlayBackdrop } from '../../lib/overlay.ts';
import type { TriggerSnippet } from '../../lib/types.ts';
import { useOverlayPortalTarget } from '../../lib/use-overlay-portal.svelte.ts';
import {
  type DrawerPlacement,
  drawerPlacementClasses,
  isDrawerPlacement,
  resolveDrawerSize,
} from './drawer.ts';
import { type OverlayStack, overlayStack } from './overlay-stack.ts';
import { useOverlayLayer } from './use-overlay-layer.svelte.ts';

/**
 * A panel that slides in from any edge. Non-modal by default: the page behind
 * stays usable and the drawer only owns Escape. With `modal` it dims the page,
 * traps focus and locks scroll. It registers with the overlay stack, so nested
 * drawers paint in open order, Escape closes only the top one, and focus
 * returns to whatever opened it.
 */
interface Props {
  open?: boolean;
  title: string;
  description?: string;
  /** Keep the title for assistive tech but hide it visually. */
  hideTitle?: boolean;
  placement?: DrawerPlacement;
  /** Width for left/right, height for top/bottom: a plain CSS length or pixels. */
  size?: string | number;
  /** Dim the page, trap focus and lock scroll. */
  modal?: boolean;
  /** Close on a pointer down outside the drawer. Defaults to `modal`. */
  closeOnOutsideClick?: boolean;
  closeOnEscape?: boolean;
  hideClose?: boolean;
  closeLabel?: string;
  /** Spread `props` onto your trigger element: `{#snippet trigger({ props })}<Button {...props}>…` */
  trigger?: TriggerSnippet;
  footer?: Snippet;
  children?: Snippet;
  onOpenChange?: (open: boolean) => void;
  /** Defaults to the shared stack; pass one to isolate a subtree (tests, embedded apps). Read once at mount. */
  stack?: OverlayStack;
  class?: string;
  ref?: HTMLElement | null;
}

let {
  open = $bindable(false),
  title,
  description,
  hideTitle = false,
  placement = 'right',
  size,
  modal = false,
  closeOnOutsideClick,
  closeOnEscape = true,
  hideClose = false,
  closeLabel = 'Close',
  trigger,
  footer,
  children,
  onOpenChange,
  stack = overlayStack,
  class: className,
  ref = $bindable(null),
}: Props = $props();

const portal = useOverlayPortalTarget();
// The stack is fixed for the drawer's lifetime; handlers use `layer.stack`.
// svelte-ignore state_referenced_locally
const layer = useOverlayLayer(() => open, { modal: () => modal, stack });

const edge = $derived(isDrawerPlacement(placement) ? placement : 'right');
const resolvedSize = $derived(resolveDrawerSize(edge, size));
const outsideCloses = $derived(closeOnOutsideClick ?? modal);

function setOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  onOpenChange?.(next);
}

// Bits closes the layer unless the handler prevents it; the drawer decides with the stack.
function handleEscape(event: KeyboardEvent): void {
  event.preventDefault();
  if (!layer.stack.isTop(layer.entry)) return;
  if (layer.stack.dismissLayerFor(event, ref)) return;
  if (closeOnEscape) setOpen(false);
}

function handleInteractOutside(event: PointerEvent): void {
  event.preventDefault();
  if (!outsideCloses || !layer.stack.isTop(layer.entry)) return;
  setOpen(false);
}

function handleCloseAutoFocus(event: Event): void {
  event.preventDefault();
  layer.restoreFocus(ref);
}
</script>

<DialogPrimitive.Root open={open} onOpenChange={setOpen}>
  {#if trigger}
    <DialogPrimitive.Trigger>
      {#snippet child({ props })}{@render trigger({ props })}{/snippet}
    </DialogPrimitive.Trigger>
  {/if}
  <DialogPrimitive.Portal to={portal.current}>
    {#if modal}
      <DialogPrimitive.Overlay class={overlayBackdrop} style={`z-index:${layer.zIndex}`} />
    {/if}
    <DialogPrimitive.Content
      bind:ref
      trapFocus={modal}
      preventScroll={modal}
      onEscapeKeydown={handleEscape}
      onInteractOutside={handleInteractOutside}
      onFocusOutside={(event) => {
        if (!modal) event.preventDefault();
      }}
      onCloseAutoFocus={handleCloseAutoFocus}
    >
      <!-- Our attributes come after the spread: Bits always marks dialogs aria-modal. -->
      {#snippet child({ props })}
        <div
          {...props}
          aria-modal={modal ? 'true' : 'false'}
          data-placement={edge}
          data-modal={modal ? 'true' : 'false'}
          class={cn(
            'ui-drawer fixed flex flex-col border-border bg-elevated text-foreground shadow-float outline-none',
            drawerPlacementClasses(edge),
            className
          )}
          style={`${typeof props.style === 'string' ? props.style : ''};--ui-drawer-size:${resolvedSize};z-index:${layer.zIndex}`}
        >
          {#if edge === 'bottom'}
            <div class="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border" aria-hidden="true"></div>
          {/if}
          <div class="flex shrink-0 items-start justify-between gap-4 px-5 pt-5 pb-3">
            <div class={cn('grid min-w-0 gap-1', hideTitle && 'sr-only')}>
              <DialogPrimitive.Title class="font-heading text-lg leading-tight font-semibold">
                {title}
              </DialogPrimitive.Title>
              {#if description}
                <DialogPrimitive.Description class="text-sm text-muted-foreground">
                  {description}
                </DialogPrimitive.Description>
              {/if}
            </div>
            {#if !hideClose}
              <DialogPrimitive.Close
                class="-mt-1 -mr-2 ml-auto inline-flex size-9 min-h-touch min-w-[44px] shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:min-h-0 sm:min-w-0"
              >
                <X class="size-4" aria-hidden="true" />
                <span class="sr-only">{closeLabel}</span>
              </DialogPrimitive.Close>
            {/if}
          </div>
          {#if children}
            <div class="min-h-0 flex-1 overflow-y-auto px-5 py-2 text-sm">{@render children()}</div>
          {/if}
          {#if footer}
            <div class="flex shrink-0 flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end">
              {@render footer()}
            </div>
          {/if}
        </div>
      {/snippet}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>

<style>
  @media (prefers-reduced-motion: no-preference) {
    :global(.ui-drawer[data-state='open']) {
      animation: ui-drawer-in 240ms cubic-bezier(0.32, 0.72, 0, 1);
    }
    :global(.ui-drawer[data-state='closed']) {
      animation: ui-drawer-out 160ms ease-in forwards;
    }
  }
  :global(.ui-drawer[data-placement='right']) {
    --ui-drawer-from: translateX(100%);
  }
  :global(.ui-drawer[data-placement='left']) {
    --ui-drawer-from: translateX(-100%);
  }
  :global(.ui-drawer[data-placement='top']) {
    --ui-drawer-from: translateY(-100%);
  }
  :global(.ui-drawer[data-placement='bottom']) {
    --ui-drawer-from: translateY(100%);
  }
  @keyframes -global-ui-drawer-in {
    from {
      transform: var(--ui-drawer-from);
    }
  }
  @keyframes -global-ui-drawer-out {
    to {
      transform: var(--ui-drawer-from);
    }
  }
</style>
