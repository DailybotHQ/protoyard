<script lang="ts">
import type { Snippet } from 'svelte';
import { cx } from 'texuli/cx';
import { Icon } from 'texuli/icons';
import { Sheet } from 'texuli/sheet';
import { refAttachment } from '../../lib/ref.ts';
import type { TriggerSnippet } from '../../lib/types.ts';
import { useOverlayPortalTarget } from '../../lib/use-overlay-portal.svelte.ts';
import { overlayDismissHandler } from './dismiss.ts';
import { type DrawerPlacement, isDrawerPlacement, resolveDrawerSize } from './drawer.ts';
import { installPopoverOrder } from './popover-order.ts';
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
// Popovers opened inside the overlay stay above Texuli's dialog backdrop (gap N30).
installPopoverOrder();
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

// The drawer decides with the stack: only the top overlay closes, and the
// undo toaster never counts as outside.
const handleDismiss = overlayDismissHandler({
  layer,
  element: () => ref,
  escape: () => closeOnEscape,
  outside: () => outsideCloses,
});

// A non-modal drawer has no focus scope, so it returns focus to its opener itself.
let wasOpen = false;
$effect(() => {
  if (open) {
    wasOpen = true;
    return;
  }
  if (!wasOpen) return;
  wasOpen = false;
  if (!modal) queueMicrotask(() => layer.restoreFocus(null));
});

function handleCloseAutoFocus(event: { preventDefault(): void }): void {
  event.preventDefault();
  layer.restoreFocus(ref);
}
</script>

<!--
  Texuli's sheet from `texuli/sheet`, on any edge. Protoyard adds the
  framed-device container (its root opens `contained` inside a device screen,
  otherwise in the top layer) and the shared overlay stack (z-order, top-layer
  dismiss, focus return).
-->
<Sheet.Root
  {open}
  onOpenChange={setOpen}
  mode={portal.mode}
  container={portal.container}
  onDismissRequest={handleDismiss}
  onCloseAutoFocus={handleCloseAutoFocus}
>
  {#if trigger}
    <Sheet.Trigger>
      {#snippet child({ props })}{@render trigger({ props })}{/snippet}
    </Sheet.Trigger>
  {/if}
  <Sheet.Portal>
    {#if modal}
      <Sheet.Overlay
        class="tx-sheet-overlay"
        data-tx-sheet-overlay=""
        style={`z-index:${layer.zIndex}`}
      />
    {/if}
    <!-- Non-modal by default: no inert page, focus trap or scroll lock. Read once, at open. -->
    {#key modal}
      <Sheet.Content
        {@attach refAttachment<HTMLElement>((node) => (ref = node))}
        side={edge}
        {modal}
        dismissOutside={!modal && outsideCloses}
        closeOnEscape={!modal && closeOnEscape}
        data-placement={edge}
        data-modal={modal ? 'true' : 'false'}
        class={cx('ui-sheet--sized', className)}
        style={`--ui-drawer-size:${resolvedSize};z-index:${layer.zIndex}`}
      >
        {#if edge === 'bottom'}
          <div data-drawer-handle aria-hidden="true"></div>
        {/if}
        <div class="ui-sheet__header">
          <div class="ui-sheet__heading" data-hidden={hideTitle ? '' : undefined}>
            <Sheet.Title class="ui-sheet__title">{title}</Sheet.Title>
            {#if description}
              <Sheet.Description class="ui-sheet__description">{description}</Sheet.Description>
            {/if}
          </div>
          {#if !hideClose}
            <Sheet.Close class="ui-sheet__close" type="button">
              <Icon icon="close" size="sm" aria-hidden="true" />
              <span class="ui-sheet__sr-only">{closeLabel}</span>
            </Sheet.Close>
          {/if}
        </div>
        {#if children}
          <div class="ui-sheet__body">{@render children()}</div>
        {/if}
        {#if footer}
          <div class="ui-sheet__footer">{@render footer()}</div>
        {/if}
      </Sheet.Content>
    {/key}
  </Sheet.Portal>
</Sheet.Root>
