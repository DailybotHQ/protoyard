<script lang="ts">
import { X } from '@lucide/svelte';
import * as DialogPrimitive from '@texuli/primitives/dialog';
import type { ComponentProps, Snippet } from 'svelte';
import { cn } from '../../lib/cn.ts';
import { overlayBackdrop } from '../../lib/overlay.ts';
import { refAttachment } from '../../lib/ref.ts';
import type { TriggerSnippet } from '../../lib/types.ts';
import { useOverlayPortalTarget } from '../../lib/use-overlay-portal.svelte.ts';
import { overlayDismissHandler } from '../overlay/dismiss.ts';
import { type OverlayStack, overlayStack } from '../overlay/overlay-stack.ts';
import { useOverlayLayer } from '../overlay/use-overlay-layer.svelte.ts';

type Props = Omit<ComponentProps<typeof DialogPrimitive.Content>, 'children' | 'title'> & {
  ref?: HTMLElement | null;
  open?: boolean;
  title: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Spread `props` onto your trigger element: `{#snippet trigger({ props })}<Button {...props}>…` */
  trigger?: TriggerSnippet;
  footer?: Snippet;
  children?: Snippet;
  hideClose?: boolean;
  closeLabel?: string;
  onOpenChange?: (open: boolean) => void;
  /** Defaults to the shared stack; pass one to isolate a subtree (tests). Read once at mount. */
  stack?: OverlayStack;
};

let {
  open = $bindable(false),
  title,
  description,
  size = 'md',
  trigger,
  footer,
  children,
  hideClose = false,
  closeLabel = 'Close',
  onOpenChange,
  stack = overlayStack,
  class: className,
  ref = $bindable(null),
  ...rest
}: Props = $props();

const portal = useOverlayPortalTarget();
// svelte-ignore state_referenced_locally
const layer = useOverlayLayer(() => open, { modal: () => true, stack });

const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' };

function setOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  onOpenChange?.(next);
}

const handleDismiss = overlayDismissHandler({ layer, element: () => ref });

function handleCloseAutoFocus(event: { preventDefault(): void }): void {
  event.preventDefault();
  layer.restoreFocus(ref);
}
</script>

<!-- Inside a framed device the dialog is contained by its screen; otherwise it opens in the top layer. -->
<DialogPrimitive.Root
  {open}
  onOpenChange={setOpen}
  mode={portal.mode}
  container={portal.container}
  onDismissRequest={handleDismiss}
  onCloseAutoFocus={handleCloseAutoFocus}
>
  {#if trigger}
    <DialogPrimitive.Trigger>
      {#snippet child({ props })}{@render trigger({ props })}{/snippet}
    </DialogPrimitive.Trigger>
  {/if}
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay class={overlayBackdrop} style={`z-index:${layer.zIndex}`} />
    <DialogPrimitive.Content
      {@attach refAttachment<HTMLElement>((node) => (ref = node))}
      class={cn(
        'fixed top-1/2 left-1/2 flex max-h-[calc(var(--py-app-height)-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col',
        'rounded-xl border border-border bg-elevated text-foreground shadow-float outline-none ui-anim-pop',
        widths[size],
        className
      )}
      {...rest}
      style={`z-index:${layer.zIndex}`}
    >
      <div class="flex items-start justify-between gap-4 px-6 pt-6 pb-2">
        <div class="grid gap-1.5">
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
            class="-mt-1 -mr-2 inline-flex size-9 min-h-touch min-w-[44px] shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:min-h-0 sm:min-w-0"
          >
            <X class="size-4" aria-hidden="true" />
            <span class="sr-only">{closeLabel}</span>
          </DialogPrimitive.Close>
        {/if}
      </div>
      {#if children}
        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-2 text-sm">{@render children()}</div>
      {/if}
      {#if footer}
        <div class="flex flex-col-reverse gap-2 px-6 pt-2 pb-6 sm:flex-row sm:justify-end">
          {@render footer()}
        </div>
      {:else}
        <div class="pb-4"></div>
      {/if}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>
