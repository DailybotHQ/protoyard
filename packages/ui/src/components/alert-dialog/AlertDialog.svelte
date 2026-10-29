<script lang="ts">
import * as AlertDialogPrimitive from '@texuli/primitives/alert-dialog';
import type { Snippet } from 'svelte';
import { Button } from 'texuli/button';
import {
  alertDialogActionsClass,
  alertDialogContentClass,
  alertDialogErrorClass,
  alertDialogIconClass,
  dialogDescriptionClass,
  dialogOverlayClass,
  dialogTitleClass,
} from 'texuli/dialog';
import { Icon } from 'texuli/icons';
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

let pending = $state(false);
/** Cancel is the safe default: it receives focus when the dialog opens. */
let cancelButton = $state<HTMLElement | null>(null);
let error = $state<string | null>(null);

async function confirm(): Promise<void> {
  if (pending) return;
  error = null;
  pending = true;
  try {
    await onConfirm?.();
    open = false;
  } catch (cause) {
    // Keep the dialog open so the user can retry or cancel with context.
    error = cause instanceof Error ? cause.message : 'The action failed. Please try again.';
  } finally {
    pending = false;
  }
}

function cancel(): void {
  if (pending) return;
  onCancel?.();
  open = false;
}

// Escape cancels (an alert never closes on an outside press); nothing closes it while pending.
const handleDismiss = overlayDismissHandler({
  layer,
  element: () => cancelButton,
  blocked: () => pending,
});
</script>

<!--
  A thin adapter over Texuli's alert dialog: the same primitive, parts and
  classes as `AlertDialog` from `texuli/dialog`, on a root that takes the
  framed-device `mode`/`container` and the shared overlay stack's dismiss and
  focus rules, which the styled alert cannot take (Texuli gap N13). Cancel, the
  safe default, takes focus when the alert opens; confirm shows a spinner while
  `onConfirm` runs.
-->
<AlertDialogPrimitive.Root
  {open}
  onOpenChange={(isOpen) => {
    if (!isOpen) {
      error = null;
      if (pending) return;
      if (open) onCancel?.();
    }
    open = isOpen;
  }}
  mode={portal.mode}
  container={portal.container}
  initialFocus={() => cancelButton}
  onDismissRequest={handleDismiss}
>
  {#if trigger}
    <AlertDialogPrimitive.Trigger>
      {#snippet child({ props })}{@render trigger({ props })}{/snippet}
    </AlertDialogPrimitive.Trigger>
  {/if}
  <AlertDialogPrimitive.Portal>
    <AlertDialogPrimitive.Overlay
      class={dialogOverlayClass()}
      data-tx-alert-dialog-overlay=""
      style={`z-index:${layer.zIndex}`}
    />
    <AlertDialogPrimitive.Content
      aria-busy={pending || undefined}
      class={alertDialogContentClass({ class: className })}
      data-tx-alert-dialog=""
      data-destructive={destructive ? 'true' : undefined}
      data-state={open ? 'open' : 'closed'}
      style={`z-index:${layer.zIndex}`}
    >
      <div class="tx-alert-dialog__row">
        {#if destructive}
          <div class={alertDialogIconClass()} aria-hidden="true" data-tx-alert-dialog-icon="">
            <Icon icon="warning" aria-hidden="true" />
          </div>
        {/if}
        <div class="tx-alert-dialog__copy">
          <AlertDialogPrimitive.Title class={dialogTitleClass()}>{title}</AlertDialogPrimitive.Title>
          {#if description}
            <AlertDialogPrimitive.Description class={dialogDescriptionClass()}>
              {description}
            </AlertDialogPrimitive.Description>
          {/if}
          {#if children}<div class="tx-alert-dialog__extra">{@render children()}</div>{/if}
        </div>
      </div>
      {#if error}
        <p class={alertDialogErrorClass()} role="alert" data-tx-alert-dialog-error="">{error}</p>
      {/if}
      <div class={alertDialogActionsClass()} data-tx-alert-dialog-actions="">
        <Button bind:ref={cancelButton} variant="outline" disabled={pending} onclick={cancel}
          >{cancelLabel}</Button
        >
        <Button
          variant={destructive ? 'destructive' : 'default'}
          loading={pending}
          onclick={confirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </AlertDialogPrimitive.Content>
  </AlertDialogPrimitive.Portal>
</AlertDialogPrimitive.Root>
