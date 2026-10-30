<script lang="ts">
import { type Snippet, untrack } from 'svelte';
import { AlertDialog as TexuliAlertDialog } from 'texuli/dialog';
import type { TriggerSnippet } from '../../lib/types.ts';
import { useOverlayPortalTarget } from '../../lib/use-overlay-portal.svelte.ts';
import { overlayDismissHandler } from '../overlay/dismiss.ts';
import { type OverlayStack, overlayStack } from '../overlay/overlay-stack.ts';
import { useOverlayLayer } from '../overlay/use-overlay-layer.svelte.ts';

interface Props {
  open?: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm action as destructive and shows a warning icon. */
  destructive?: boolean;
  /** May return a promise: the dialog shows a spinner and closes once it resolves. */
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
  trigger?: TriggerSnippet;
  /** Extra content between the description and the actions (e.g. a consequences list). */
  children?: Snippet;
  class?: string;
  /** Defaults to the shared stack; pass one to isolate a subtree (tests). Read once at mount. */
  stack?: OverlayStack;
}

let {
  open = $bindable(false),
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
  trigger,
  children,
  class: className,
  stack = overlayStack,
}: Props = $props();

const portal = useOverlayPortalTarget();
// svelte-ignore state_referenced_locally
const layer = useOverlayLayer(() => open, { modal: () => true, stack });

let content = $state<HTMLElement | null>(null);
/** Set when this close was a confirm or the Cancel button, so `onCancel` runs once. */
let settled = false;

async function confirm(): Promise<void> {
  await onConfirm?.();
  settled = true;
}

function cancel(): void {
  settled = true;
  onCancel?.();
}

// Texuli's AlertDialog binds `open` to its root and then skips its own
// `onOpenChange`, so a close from inside never reaches the caller (Texuli gap:
// styled dialog onOpenChange on close). `shown` follows the parent; a close
// Texuli makes is reported here, and Escape (an alert never closes on an
// outside press) counts as a cancel.
// svelte-ignore state_referenced_locally
let shown = $state(open);
$effect.pre(() => {
  shown = open;
});
$effect.pre(() => {
  const next = shown;
  untrack(() => {
    if (next === open) return;
    if (!next && !settled) onCancel?.();
    settled = false;
    open = next;
  });
});

// Only the top overlay closes, and a menu open inside the alert takes Escape first.
const handleDismiss = overlayDismissHandler({ layer, element: () => content });

function handleCloseAutoFocus(event: { preventDefault(): void }): void {
  event.preventDefault();
  layer.restoreFocus(content);
}
</script>

<!--
  Texuli's styled `AlertDialog`: Cancel, the safe default, takes focus when it
  opens, confirm shows a spinner while `onConfirm` runs and a rejection keeps
  the alert open with the error. Inside a framed device it is contained by the
  device screen, and the shared overlay stack orders it and returns focus.
-->
<TexuliAlertDialog
  bind:ref={content}
  bind:open={shown}
  {title}
  {description}
  {confirmLabel}
  {cancelLabel}
  {destructive}
  {trigger}
  {children}
  class={className}
  onConfirm={confirm}
  onCancel={cancel}
  mode={portal.mode}
  container={portal.container}
  onDismissRequest={handleDismiss}
  onCloseAutoFocus={handleCloseAutoFocus}
  style={`z-index:${layer.zIndex}`}
/>
