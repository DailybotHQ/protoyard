<script lang="ts">
import Undo2 from '@lucide/svelte/icons/undo-2';
import { getInertRegistry } from '@texuli/core/inert';
import { OVERLAY_Z_BASE } from '@texuli/core/overlay-core';
import { createPortal } from '@texuli/core/portal';
import type { Attachment } from 'svelte/attachments';
import type { HTMLAttributes } from 'svelte/elements';
import { Button, IconButton } from 'texuli/button';
import { Icon } from 'texuli/icons';
import { cn } from '../../lib/cn.ts';
import { useOverlayPortalTarget } from '../../lib/use-overlay-portal.svelte.ts';
import { UNDO_TOASTER_ATTR } from '../overlay/focus-exempt.ts';
import { overlayStack } from '../overlay/overlay-stack.ts';
import { useOverlayTopZIndex } from '../overlay/use-overlay-layer.svelte.ts';
import { undoToast } from './undo.svelte.ts';

interface OwnProps {
  /** The toaster's region (`<section>`) element (bindable). */
  ref?: HTMLElement | null;
  class?: string;
  /** Landmark label for the region. */
  label?: string;
}

/** Extra attributes (`data-*`, `aria-*`, `id`, handlers…) land on the region element. */
type Props = OwnProps & Omit<HTMLAttributes<HTMLElement>, keyof OwnProps | 'popover'>;

let {
  class: className,
  label = 'Undo notifications',
  ref = $bindable(null),
  style,
  ...rest
}: Props = $props();

const portal = useOverlayPortalTarget();
// Above every open drawer, so an undo offered from inside one stays visible.
const topZ = useOverlayTopZIndex();
// Contained overlays (and browsers without a top layer) order themselves from
// OVERLAY_Z_BASE; the region stays above those too.
let openOverlays = $state(overlayStack.size);
$effect(() => overlayStack.subscribe((size) => (openOverlays = size)));
const zIndex = $derived(
  Math.max(60, topZ.current, openOverlays > 0 ? OVERLAY_Z_BASE + openOverlays + 1 : 0)
);

/** Moves the toaster into the framed device screen while a shell sets one, else to `body`. */
const portalTo: Attachment<HTMLElement> = (node) => {
  const portalled = createPortal(node, { target: portal.current ?? null });
  return () => portalled.destroy();
};

/**
 * Keeps the region usable under a modal overlay: it is an inert exemption,
 * which Texuli's overlays treat as part of every modal (never inert, never
 * "outside", Tab reaches it, and a top-layer overlay that opens re-raises it).
 */
const aboveOverlays: Attachment<HTMLElement> = (node) => {
  let exemption: { release(): void } | null = null;
  try {
    exemption = getInertRegistry().exempt({ element: node, label: 'undo-toaster' });
  } catch {
    exemption = null;
  }
  const popover = node as HTMLElement & { showPopover?(): void; hidePopover?(): void };
  const inTopLayer = () => {
    try {
      return node.matches(':popover-open');
    } catch {
      return false;
    }
  };
  const raise = () => {
    try {
      if (inTopLayer()) popover.hidePopover?.();
      popover.showPopover?.();
    } catch {
      // Engines without popovers keep the fixed z-index from the stack.
    }
  };
  // Inside a device frame overlays are contained, ordered by z-index: no top layer.
  if (!portal.current) raise();
  return () => {
    exemption?.release();
    try {
      if (inTopLayer()) popover.hidePopover?.();
    } catch {
      // Already hidden.
    }
  };
};

// F6 moves focus to the newest toast's Undo, from anywhere, modal overlays included
// (Tab stays inside a modal, per WAI-ARIA APG; this is the way out to the toasts).
function handleHotkey(event: KeyboardEvent): void {
  if (event.key !== 'F6' || event.altKey || event.ctrlKey || event.metaKey) return;
  const undo = document.querySelector<HTMLElement>(
    `[${UNDO_TOASTER_ATTR}] li:last-child button:not([disabled])`
  );
  if (!undo) return;
  event.preventDefault();
  undo.focus();
}

const politeText = $derived(
  undoToast.announcement && !undoToast.announcement.assertive ? undoToast.announcement.text : ''
);
const assertiveText = $derived(
  undoToast.announcement?.assertive ? undoToast.announcement.text : ''
);

function handleFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget;
  if (!(next instanceof Node) || !(event.currentTarget as HTMLElement).contains(next)) {
    undoToast.resume();
  }
}

// Escape anywhere inside a toast dismisses that toast (not an overlay behind it).
function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !(event.target instanceof Element)) return;
  const id = event.target.closest<HTMLElement>('[data-undo-id]')?.dataset.undoId;
  if (!id) return;
  event.stopPropagation();
  undoToast.dismiss(id);
}
</script>

<svelte:window onkeydown={handleHotkey} />

<div data-ui-undo-toaster-host="" {@attach portalTo}>
  <!-- Live regions stay mounted so screen readers reliably announce new messages. -->
  <div class="sr-only" aria-live="polite" aria-atomic="true">{politeText}</div>
  <div class="sr-only" aria-live="assertive" aria-atomic="true">{assertiveText}</div>

  <section
    {...rest}
    bind:this={ref}
    aria-label={label}
    {...{ [UNDO_TOASTER_ATTR]: '' }}
    popover="manual"
    {@attach aboveOverlays}
    style={`${style ? `${style};` : ''}z-index:${zIndex}`}
    class={cn(
      // Reset the popover defaults (centered box, border, padding, background).
      'top-auto m-0 h-auto max-h-none w-auto max-w-none overflow-visible border-0 bg-transparent pt-0',
      // Phones center the stack; `--py-fixed-right-edge` (set by the renderer) keeps it on the visible width.
      'pointer-events-none fixed inset-x-0 bottom-0 flex justify-center pl-4 pr-[calc(1rem+var(--py-fixed-right-edge,0px))] pb-[max(1rem,env(safe-area-inset-bottom))]',
      'sm:inset-x-auto sm:left-0 sm:justify-start sm:p-6',
      className
    )}
  >
    {#if undoToast.items.length > 0}
      <!-- Only the toasts take pointer events, so taps in the gaps reach the page. -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions (Escape is delegated from the focused Undo or Dismiss button inside a toast.) -->
      <ol
        class="pointer-events-none flex w-full max-w-sm flex-col gap-2"
        onmouseenter={undoToast.pause}
        onmouseleave={undoToast.resume}
        onfocusin={undoToast.pause}
        onfocusout={handleFocusOut}
        onkeydown={handleKeydown}
      >
        {#each undoToast.items as item (item.id)}
          {@const hintId = `${item.id}-undo-hint`}
          <li
            data-undo-id={item.id}
            data-status={item.status}
            class="pointer-events-auto relative overflow-hidden rounded-lg border border-border bg-elevated text-foreground shadow-float ui-anim-toast"
          >
            <div class="flex items-center gap-2 p-3 pr-2">
              <div class="grid min-w-0 flex-1 gap-0.5">
                <p class="text-sm font-medium">{item.message}</p>
                {#if item.description}
                  <p class="text-sm text-muted-foreground">{item.description}</p>
                {/if}
                {#if item.error}
                  <p class="text-sm text-destructive">{item.error}</p>
                {/if}
              </div>
              <Button
                variant="ghost"
                size="sm"
                class="shrink-0 font-semibold text-primary"
                aria-describedby={hintId}
                loadingLabel="Undoing"
                onclick={() => undoToast.undo(item.id)}
              >
                <Icon icon={Undo2} size="sm" aria-hidden="true" />
                {item.status === 'failed' ? `Retry ${item.undoLabel.toLowerCase()}` : item.undoLabel}
              </Button>
              <span id={hintId} class="sr-only">
                Available for {Math.round(item.duration / 1000)} seconds. {item.message}.
              </span>
              <IconButton
                variant="ghost"
                size="sm"
                label={`Dismiss: ${item.message}`}
                class="shrink-0 text-muted-foreground"
                disabled={item.status === 'undoing'}
                onclick={() => undoToast.dismiss(item.id)}
              >
                <Icon icon="close" size="sm" aria-hidden="true" />
              </IconButton>
            </div>
            {#key item.revision}
              <div
                class="ui-undo-countdown absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary"
                style={`animation-duration:${item.duration}ms;animation-play-state:${undoToast.paused || item.status === 'undoing' ? 'paused' : 'running'}`}
                aria-hidden="true"
              ></div>
            {/key}
          </li>
        {/each}
      </ol>
    {/if}
  </section>
</div>

<style>
  .ui-undo-countdown {
    animation-name: ui-undo-countdown;
    animation-timing-function: linear;
    animation-fill-mode: forwards;
  }
  /* A bar that jumps to empty would mislead; without motion the hint text carries the window. */
  @media (prefers-reduced-motion: reduce) {
    .ui-undo-countdown {
      display: none;
    }
  }
  :global([data-py-motion='reduce']) .ui-undo-countdown {
    display: none;
  }
  @keyframes ui-undo-countdown {
    from {
      transform: scaleX(1);
    }
    to {
      transform: scaleX(0);
    }
  }
</style>
