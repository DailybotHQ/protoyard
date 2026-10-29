<script lang="ts">
import * as DialogPrimitive from '@texuli/primitives/dialog';
import type { ComponentProps, Snippet } from 'svelte';
import { Icon } from 'texuli/icons';
import { DetailPanel as Panel } from 'texuli/sheet';
import { refAttachment } from '../../lib/ref.ts';
import type { TriggerSnippet } from '../../lib/types.ts';
import { useOverlayPortalTarget } from '../../lib/use-overlay-portal.svelte.ts';
import { overlayDismissHandler } from '../overlay/dismiss.ts';
import { type OverlayStack, overlayStack } from '../overlay/overlay-stack.ts';
import { installPopoverOrder } from '../overlay/popover-order.ts';
import { useOverlayLayer } from '../overlay/use-overlay-layer.svelte.ts';

type Props = Omit<ComponentProps<typeof Panel.Content>, 'children' | 'title'> & {
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
  Texuli's detail panel from `texuli/sheet` (an end-side panel, full width on
  phones). Protoyard adds the framed-device container (its root opens
  `contained` inside a device screen, otherwise in the top layer) and the
  shared overlay stack (z-order, top-layer dismiss, focus return).
-->
<Panel.Root
  {open}
  onOpenChange={setOpen}
  mode={portal.mode}
  container={portal.container}
  onDismissRequest={handleDismiss}
  onCloseAutoFocus={handleCloseAutoFocus}
>
  {#if trigger}
    <Panel.Trigger>
      {#snippet child({ props })}{@render trigger({ props })}{/snippet}
    </Panel.Trigger>
  {/if}
  <Panel.Portal>
    <!-- The panel parts are the dialog's, so the dialog overlay is the panel's backdrop. -->
    <DialogPrimitive.Overlay
      class="tx-sheet-overlay"
      data-tx-sheet-overlay=""
      style={`z-index:${layer.zIndex}`}
    />
    <Panel.Content
      {@attach refAttachment<HTMLElement>((node) => (ref = node))}
      side="end"
      {size}
      class={className}
      {...rest}
      style={`z-index:${layer.zIndex}`}
    >
      <div class="ui-sheet__header">
        <div class="ui-sheet__heading">
          <Panel.Title class="ui-sheet__title">{title}</Panel.Title>
          {#if description}
            <Panel.Description class="ui-sheet__description">{description}</Panel.Description>
          {/if}
        </div>
        {#if headerActions}<div class="ui-sheet__actions">{@render headerActions()}</div>{/if}
        <Panel.Close class="ui-sheet__close" type="button">
          <Icon icon="close" size="sm" aria-hidden="true" />
          <span class="ui-sheet__sr-only">{closeLabel}</span>
        </Panel.Close>
      </div>
      <div class="ui-sheet__body">{@render children?.()}</div>
      {#if footer}
        <div class="ui-sheet__footer">{@render footer()}</div>
      {/if}
    </Panel.Content>
  </Panel.Portal>
</Panel.Root>
