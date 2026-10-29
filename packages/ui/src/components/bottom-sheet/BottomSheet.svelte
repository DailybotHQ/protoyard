<script lang="ts">
import type { ComponentProps, Snippet } from 'svelte';
import { cx } from 'texuli/cx';
import { Drawer } from 'texuli/sheet';
import { refAttachment } from '../../lib/ref.ts';
import type { TriggerSnippet } from '../../lib/types.ts';
import { useOverlayPortalTarget } from '../../lib/use-overlay-portal.svelte.ts';
import { overlayDismissHandler } from '../overlay/dismiss.ts';
import { type OverlayStack, overlayStack } from '../overlay/overlay-stack.ts';
import { installPopoverOrder } from '../overlay/popover-order.ts';
import { useOverlayLayer } from '../overlay/use-overlay-layer.svelte.ts';

type Props = Omit<
  ComponentProps<typeof Drawer.Content>,
  'children' | 'title' | 'side' | 'dismissible' | 'snapPoints' | 'activeSnapPoint'
> & {
  ref?: HTMLElement | null;
  open?: boolean;
  title: string;
  description?: string;
  /** Keep the title for assistive tech but hide it visually. */
  hideTitle?: boolean;
  trigger?: TriggerSnippet;
  footer?: Snippet;
  children?: Snippet;
  onOpenChange?: (open: boolean) => void;
  /** Drag the sheet down to close (Esc and the backdrop always work). */
  swipeToDismiss?: boolean;
  /** Defaults to the shared stack; pass one to isolate a subtree (tests). Read once at mount. */
  stack?: OverlayStack;
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
  stack = overlayStack,
  class: className,
  ref = $bindable(null),
  ...rest
}: Props = $props();

const portal = useOverlayPortalTarget();
// Popovers opened inside the overlay stay above Texuli's dialog backdrop (gap N30).
installPopoverOrder();
// svelte-ignore state_referenced_locally
const layer = useOverlayLayer(() => open, { modal: () => true, stack });

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

<!--
  Texuli's drawer from `texuli/sheet` (drag with fling and snap back,
  reduced-motion aware), from the bottom edge. Protoyard adds the framed-device
  container (its root opens `contained` inside a device screen, otherwise in
  the top layer) and the shared overlay stack (z-order, top-layer dismiss,
  focus return).
-->
<Drawer.Root
  {open}
  onOpenChange={setOpen}
  mode={portal.mode}
  container={portal.container}
  onDismissRequest={handleDismiss}
  onCloseAutoFocus={handleCloseAutoFocus}
>
  {#if trigger}
    <Drawer.Trigger>
      {#snippet child({ props })}{@render trigger({ props })}{/snippet}
    </Drawer.Trigger>
  {/if}
  <Drawer.Portal>
    <Drawer.Overlay
      class="tx-sheet-overlay"
      data-tx-sheet-overlay=""
      style={`z-index:${layer.zIndex}`}
    />
    <Drawer.Content
      {@attach refAttachment<HTMLElement>((node) => (ref = node))}
      side="bottom"
      dismissible={swipeToDismiss}
      class={cx('ui-bottom-sheet', className)}
      {...rest}
      style={`z-index:${layer.zIndex}`}
    >
      <Drawer.Handle />
      <div class="ui-sheet__heading ui-bottom-sheet__heading" data-hidden={hideTitle ? '' : undefined}>
        <Drawer.Title class="ui-sheet__title">{title}</Drawer.Title>
        {#if description}
          <Drawer.Description class="ui-sheet__description">{description}</Drawer.Description>
        {/if}
      </div>
      <div class="ui-sheet__body">{@render children?.()}</div>
      {#if footer}
        <div class="ui-sheet__footer ui-bottom-sheet__footer">{@render footer()}</div>
      {/if}
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>
