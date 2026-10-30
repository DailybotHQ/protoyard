<script lang="ts">
import { type ComponentProps, type Snippet, untrack } from 'svelte';
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
  /** Defaults to the shared stack; pass one to isolate a subtree (tests). Read once at mount. */
  stack?: OverlayStack;
};

let {
  open = $bindable(false),
  closeLabel = 'Close',
  onOpenChange,
  stack = overlayStack,
  style,
  ref = $bindable(null),
  ...rest
}: Props = $props();

const portal = useOverlayPortalTarget();
// svelte-ignore state_referenced_locally
const layer = useOverlayLayer(() => open, { modal: () => true, stack });

// Texuli's Dialog binds `open` to its root and then skips its own
// `onOpenChange` (the value already changed), so a close from inside (Close,
// Escape, an outside press) never reaches the caller. Watch the bound value
// instead: `shown` follows the parent, and a change Texuli makes is reported
// once (Texuli gap G87).
// svelte-ignore state_referenced_locally
let shown = $state(open);
$effect.pre(() => {
  shown = open;
});
$effect.pre(() => {
  const next = shown;
  untrack(() => {
    if (next === open) return;
    open = next;
    onOpenChange?.(next);
  });
});

const handleDismiss = overlayDismissHandler({ layer, element: () => ref });

function handleCloseAutoFocus(event: { preventDefault(): void }): void {
  event.preventDefault();
  layer.restoreFocus(ref);
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
  bind:open={shown}
  {closeLabel}
  mode={portal.mode}
  container={portal.container}
  onDismissRequest={handleDismiss}
  onCloseAutoFocus={handleCloseAutoFocus}
  style={`${style ? `${style};` : ''}z-index:${layer.zIndex}`}
/>
