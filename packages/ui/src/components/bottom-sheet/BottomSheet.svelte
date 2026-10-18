<script lang="ts">
import { Dialog as DialogPrimitive } from 'bits-ui';
import type { Snippet } from 'svelte';
import { cn } from '../../lib/cn.ts';
import { overlayBackdrop } from '../../lib/overlay.ts';
import type { TriggerSnippet } from '../../lib/types.ts';
import { useOverlayPortalTarget } from '../../lib/use-overlay-portal.svelte.ts';
import { prefersReducedMotion, shouldDismissSwipe } from './swipe.ts';

type Props = Omit<DialogPrimitive.ContentProps, 'children' | 'child' | 'title'> & {
  open?: boolean;
  title: string;
  description?: string;
  /** Keep the title for assistive tech but hide it visually. */
  hideTitle?: boolean;
  trigger?: TriggerSnippet;
  footer?: Snippet;
  children?: Snippet;
  onOpenChange?: (open: boolean) => void;
  /** Drag the handle/header down to close (Esc and the backdrop always work). */
  swipeToDismiss?: boolean;
};

let {
  open = $bindable(false),
  title,
  description,
  hideTitle = false,
  trigger,
  footer,
  children,
  onOpenChange,
  swipeToDismiss = true,
  class: className,
  ref = $bindable(null),
  ...rest
}: Props = $props();

const portal = useOverlayPortalTarget();

let drag = $state<{ id: number; startY: number; startAt: number; dy: number } | null>(null);
let settling = $state(false);

function onpointerdown(event: PointerEvent) {
  if (!swipeToDismiss || event.button !== 0) return;
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  drag = { id: event.pointerId, startY: event.clientY, startAt: performance.now(), dy: 0 };
  settling = false;
}

function onpointermove(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.id) return;
  // Only downward travel; a little resistance upwards keeps it feeling attached.
  const raw = event.clientY - drag.startY;
  drag.dy = raw > 0 ? raw : raw / 6;
}

function onpointerup(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.id) return;
  const dismiss = shouldDismissSwipe({
    distance: drag.dy,
    height: ref?.getBoundingClientRect().height ?? 0,
    durationMs: performance.now() - drag.startAt,
  });
  drag = null;
  // Snap back smoothly unless the user asked for reduced motion.
  settling = !prefersReducedMotion(ref);
  if (settling) setTimeout(() => (settling = false), 220);
  if (dismiss) {
    open = false;
    onOpenChange?.(false);
  }
}

const dragStyle = $derived(
  drag && drag.dy !== 0 ? `transform: translateY(${drag.dy}px); transition: none;` : undefined
);
</script>

<DialogPrimitive.Root bind:open {onOpenChange}>
  {#if trigger}
    <DialogPrimitive.Trigger>
      {#snippet child({ props })}{@render trigger({ props })}{/snippet}
    </DialogPrimitive.Trigger>
  {/if}
  <DialogPrimitive.Portal to={portal.current}>
    <DialogPrimitive.Overlay class={overlayBackdrop} />
    <DialogPrimitive.Content
      bind:ref
      class={cn(
        'fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[calc(var(--py-app-height)*0.9)] w-full max-w-lg flex-col rounded-t-2xl border border-b-0 border-border bg-elevated text-foreground shadow-float outline-none ui-anim-sheet',
        settling && 'transition-transform duration-200 ease-out',
        className
      )}
      {...rest}
      style={dragStyle}
    >
      <!-- Drag zone: the handle and header. Pointer-only by design; keyboard users close with Esc. -->
      <div
        class={cn('shrink-0 touch-none select-none', swipeToDismiss && 'cursor-grab active:cursor-grabbing')}
        data-sheet-drag-handle=""
        {onpointerdown}
        {onpointermove}
        {onpointerup}
        onpointercancel={() => (drag = null)}
        role="presentation"
      >
        <div class="mx-auto mt-2.5 mb-1 h-1.5 w-10 rounded-full bg-muted-foreground/30" aria-hidden="true"></div>
      <div class={cn('grid gap-1 px-5 pt-2 pb-3 text-center', hideTitle && 'sr-only')}>
        <DialogPrimitive.Title class="font-heading text-base font-semibold">{title}</DialogPrimitive.Title>
        {#if description}
          <DialogPrimitive.Description class="text-sm text-muted-foreground">
            {description}
          </DialogPrimitive.Description>
        {/if}
      </div>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto px-5 pb-4 text-sm">{@render children?.()}</div>
      {#if footer}
        <div class="flex flex-col gap-2 border-t border-border px-5 pt-3 pb-3">{@render footer()}</div>
      {/if}
      <div class="pb-safe"></div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>
