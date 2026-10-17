<script lang="ts">
import { TriangleAlert } from '@lucide/svelte';
import { AlertDialog as AlertDialogPrimitive } from 'bits-ui';
import type { Snippet } from 'svelte';
import { cn } from '../../lib/cn.ts';
import { overlayBackdrop } from '../../lib/overlay.ts';
import type { TriggerSnippet } from '../../lib/types.ts';
import Button from '../button/Button.svelte';

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
}: Props = $props();

let pending = $state(false);
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

function blockWhilePending(event: Event): void {
  if (pending) event.preventDefault();
}
</script>

<AlertDialogPrimitive.Root
  bind:open
  onOpenChange={(isOpen) => {
    if (!isOpen) error = null;
  }}
>
  {#if trigger}
    <AlertDialogPrimitive.Trigger>
      {#snippet child({ props })}{@render trigger({ props })}{/snippet}
    </AlertDialogPrimitive.Trigger>
  {/if}
  <AlertDialogPrimitive.Portal>
    <AlertDialogPrimitive.Overlay class={overlayBackdrop} />
    <AlertDialogPrimitive.Content
      onEscapeKeydown={blockWhilePending}
      aria-busy={pending || undefined}
      class={cn(
        'fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 sm:max-w-md',
        'rounded-xl border border-border bg-elevated p-6 text-foreground shadow-float outline-none ui-anim-pop',
        className
      )}
    >
      <div class="flex gap-4">
        {#if destructive}
          <div
            class="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
            aria-hidden="true"
          >
            <TriangleAlert class="size-5" />
          </div>
        {/if}
        <div class="grid gap-1.5">
          <AlertDialogPrimitive.Title class="font-heading text-lg leading-tight font-semibold">
            {title}
          </AlertDialogPrimitive.Title>
          {#if description}
            <AlertDialogPrimitive.Description class="text-sm text-muted-foreground">
              {description}
            </AlertDialogPrimitive.Description>
          {/if}
          {#if children}<div class="mt-1 text-sm">{@render children()}</div>{/if}
        </div>
      </div>
      {#if error}
        <p
          role="alert"
          class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground"
        >
          {error}
        </p>
      {/if}
      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" disabled={pending} onclick={cancel}>{cancelLabel}</Button>
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
