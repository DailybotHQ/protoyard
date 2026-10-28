<script lang="ts">
import * as DialogPrimitive from '@texuli/primitives/dialog';
import type { ComponentProps, Snippet } from 'svelte';
import {
  dialogBodyClass,
  dialogCloseClass,
  dialogContentClass,
  dialogDescriptionClass,
  dialogFooterClass,
  dialogHeaderClass,
  dialogOverlayClass,
  dialogTitleClass,
} from 'texuli/dialog';
import { Icon } from 'texuli/icons';
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
  A thin adapter over Texuli's dialog: the same primitive, parts and classes as
  `Dialog` from `texuli/dialog`, plus what that component cannot take yet
  (Texuli gaps G4 and G5): the shared overlay stack (z-order and dismiss of the
  top layer), the framed-device portal, `bind:ref` and rest attributes. Inside a
  framed device the dialog is contained by its screen; otherwise it opens in the
  top layer.
-->
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
    <DialogPrimitive.Overlay
      class={dialogOverlayClass()}
      data-tx-dialog-overlay=""
      style={`z-index:${layer.zIndex}`}
    />
    <DialogPrimitive.Content
      {@attach refAttachment<HTMLElement>((node) => (ref = node))}
      class={dialogContentClass({ size, class: className })}
      data-tx-dialog=""
      data-size={size}
      data-state={open ? 'open' : 'closed'}
      {...rest}
      style={`z-index:${layer.zIndex}`}
    >
      <div class={dialogHeaderClass()} data-tx-dialog-header="">
        <div class="tx-dialog__heading">
          <DialogPrimitive.Title class={dialogTitleClass()}>{title}</DialogPrimitive.Title>
          {#if description}
            <DialogPrimitive.Description class={dialogDescriptionClass()}>
              {description}
            </DialogPrimitive.Description>
          {/if}
        </div>
        {#if !hideClose}
          <DialogPrimitive.Close class={dialogCloseClass()} data-tx-dialog-close="" type="button">
            <Icon icon="close" size="sm" aria-hidden="true" />
            <span class="tx-dialog__close-label">{closeLabel}</span>
          </DialogPrimitive.Close>
        {/if}
      </div>
      {#if children}
        <div class={dialogBodyClass()} data-tx-dialog-body="">{@render children()}</div>
      {/if}
      {#if footer}
        <div class={dialogFooterClass()} data-tx-dialog-footer="">{@render footer()}</div>
      {:else}
        <div class="tx-dialog__footer-spacer" aria-hidden="true"></div>
      {/if}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>
