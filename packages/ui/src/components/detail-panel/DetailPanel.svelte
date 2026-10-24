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
  trigger?: TriggerSnippet;
  /** Content rendered next to the title (status badge, actions menu…). */
  headerActions?: Snippet;
  footer?: Snippet;
  children?: Snippet;
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
  headerActions,
  footer,
  children,
  closeLabel = 'Close panel',
  onOpenChange,
  stack = overlayStack,
  class: className,
  ref = $bindable(null),
  ...rest
}: Props = $props();

const portal = useOverlayPortalTarget();
// svelte-ignore state_referenced_locally
const layer = useOverlayLayer(() => open, { modal: () => true, stack });

const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-xl', xl: 'sm:max-w-3xl' };

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

<!-- Inside a framed device the panel is contained by its screen; otherwise it opens in the top layer. -->
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
        // Phone: near full-screen bottom sheet. Larger screens: right-hand side panel.
        'fixed inset-x-0 bottom-0 flex h-[calc(var(--py-app-height)-1.5rem)] flex-col rounded-t-2xl border border-border bg-elevated text-foreground shadow-float outline-none ui-anim-panel',
        'sm:inset-y-0 sm:right-0 sm:left-auto sm:h-full sm:w-full sm:rounded-none sm:rounded-l-2xl sm:border-y-0 sm:border-r-0',
        widths[size],
        className
      )}
      {...rest}
      style={`z-index:${layer.zIndex}`}
    >
      <div class="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30 sm:hidden" aria-hidden="true"></div>
      <div class="flex items-start gap-3 border-b border-border px-5 pt-4 pb-4 sm:pt-5">
        <div class="grid min-w-0 flex-1 gap-1">
          <DialogPrimitive.Title class="truncate font-heading text-lg leading-tight font-semibold">
            {title}
          </DialogPrimitive.Title>
          {#if description}
            <DialogPrimitive.Description class="text-sm text-muted-foreground">
              {description}
            </DialogPrimitive.Description>
          {/if}
        </div>
        {#if headerActions}<div class="flex items-center gap-1">{@render headerActions()}</div>{/if}
        <DialogPrimitive.Close
          class="-mr-2 inline-flex size-9 min-h-touch min-w-[44px] shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:min-h-0 sm:min-w-0"
        >
          <X class="size-4" aria-hidden="true" />
          <span class="sr-only">{closeLabel}</span>
        </DialogPrimitive.Close>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm">{@render children?.()}</div>
      {#if footer}
        <div
          class="flex flex-col-reverse gap-2 border-t border-border px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end"
        >
          {@render footer()}
        </div>
      {/if}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>
