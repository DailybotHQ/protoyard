<script lang="ts">
import type { ComponentProps, Snippet } from 'svelte';
import { Dialog as TexuliDialog } from 'texuli/dialog';
import type { TriggerSnippet } from '../../lib/types.ts';
import { useOverlayPortalTarget } from '../../lib/use-overlay-portal.svelte.ts';
import { overlayDismissHandler } from '../overlay/dismiss.ts';
import { type OverlayStack, overlayStack } from '../overlay/overlay-stack.ts';
import { useOverlayLayer } from '../overlay/use-overlay-layer.svelte.ts';

type TexuliProps = ComponentProps<typeof TexuliDialog>;

type Props = Omit<
  TexuliProps,
  | 'open'
  | 'title'
  | 'trigger'
  | 'footer'
  | 'children'
  | 'stack'
  | 'mode'
  | 'container'
  | 'onDismissRequest'
  | 'onCloseAutoFocus'
  | 'ref'
> & {
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
  /**
   * Runs when the dialog closes, before focus returns. Call
   * `event.preventDefault()` to move focus yourself; otherwise focus returns
   * to where it was, through the shared overlay stack.
   */
  onCloseAutoFocus?: (event: { preventDefault(): void }) => void;
  /** Defaults to the shared stack; pass one to isolate a subtree (tests). Read once at mount. */
  stack?: OverlayStack;
};

let {
  open = $bindable(false),
  closeLabel,
  onOpenChange,
  onCloseAutoFocus,
  stack = overlayStack,
  style,
  ref = $bindable(null),
  ...rest
}: Props = $props();

const portal = useOverlayPortalTarget();
// svelte-ignore state_referenced_locally
const layer = useOverlayLayer(() => open, { modal: () => true, stack });

const handleDismiss = overlayDismissHandler({ layer, element: () => ref });

function handleCloseAutoFocus(event: { preventDefault(): void }): void {
  event.preventDefault();
  let handled = false;
  onCloseAutoFocus?.({
    preventDefault() {
      handled = true;
    },
  });
  if (!handled) layer.restoreFocus(ref);
}
</script>

<!--
  Texuli's styled `Dialog`. Inside a framed device it is contained by the
  device screen (otherwise it opens in the top layer), and the shared overlay
  stack orders it, lets only the top overlay close, and returns focus.
-->
<TexuliDialog
  {...rest}
  bind:ref
  bind:open
  {onOpenChange}
  {closeLabel}
  mode={portal.mode}
  container={portal.container}
  onDismissRequest={handleDismiss}
  onCloseAutoFocus={handleCloseAutoFocus}
  style={`${style ? `${style};` : ''}z-index:${layer.zIndex}`}
/>
