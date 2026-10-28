<script lang="ts">
import { ExternalLink } from '@lucide/svelte';
import type { ButtonsBlock, MessageButton } from '@protoyard/ai/messages';
import { tick } from 'svelte';
import { Button, type ButtonVariant } from 'texuli/button';
import { LucideIcon } from 'texuli/icons/lucide';
import { type MessageActionHandler, settle } from './types.ts';

/**
 * Action and link buttons, drawn with Texuli's `Button`. An action button
 * reports `{ kind: 'button' }` and stays busy (`loading`) while the host's
 * promise is pending; a confirmation asks first, inline, with Cancel focused.
 * Link buttons go through Texuli's URL policy at the untrusted tier (message
 * content is untrusted) and open in a new tab without access to this page
 * (`noopener noreferrer`).
 */
let {
  block,
  blockIndex,
  messageId,
  onAction,
}: {
  block: ButtonsBlock;
  blockIndex: number;
  messageId: string | null;
  onAction?: MessageActionHandler;
} = $props();

const uid = $props.id();
let pending = $state<number | null>(null);
let confirming = $state<number | null>(null);
let error = $state('');
let cancelButton = $state<HTMLElement | null>(null);
// One slot per button (the block is fixed for this component's life), so each binds a defined ref.
// svelte-ignore state_referenced_locally
const triggers: (HTMLElement | null)[] = $state(block.buttons.map(() => null));

const VARIANT: Record<MessageButton['style'], ButtonVariant> = {
  default: 'outline',
  primary: 'default',
  danger: 'destructive',
};

async function run(index: number): Promise<void> {
  const button = block.buttons[index];
  if (!button?.action || !onAction || pending !== null) return;
  const fromConfirm = confirming !== null;
  confirming = null;
  pending = index;
  error = '';
  error =
    (await settle(() =>
      onAction({
        kind: 'button',
        messageId,
        blockIndex,
        action: button.action as string,
        value: button.value ?? null,
      })
    )) ?? '';
  pending = null;
  // The confirmation closed under the keyboard; give focus back to the button.
  if (fromConfirm) {
    await tick();
    triggers[index]?.focus();
  }
}

async function press(index: number): Promise<void> {
  if (block.buttons[index]?.confirm) {
    confirming = index;
    await tick();
    cancelButton?.focus();
    return;
  }
  await run(index);
}

async function cancel(): Promise<void> {
  const index = confirming;
  confirming = null;
  await tick();
  if (index !== null) triggers[index]?.focus();
}
</script>

<div class="grid gap-2" data-py-message-block="buttons">
  <div class="flex flex-wrap gap-2">
    {#each block.buttons as button, index (index)}
      {#if button.url}
        <Button
          variant={VARIANT[button.style]}
          href={button.url}
          hrefTrust="untrusted"
          target="_blank"
          rel="noopener noreferrer"
        >
          {button.label}
          <LucideIcon icon={ExternalLink} size="xs" />
          <span class="sr-only">(opens in a new tab)</span>
        </Button>
      {:else}
        <!-- Pending is the component's own state (it also blocks the other buttons), so autoLoading is off. -->
        <Button
          variant={VARIANT[button.style]}
          bind:ref={triggers[index]}
          autoLoading={false}
          loading={pending === index}
          disabled={!onAction || pending !== null}
          aria-expanded={button.confirm ? confirming === index : undefined}
          aria-controls={button.confirm ? `${uid}-confirm` : undefined}
          onclick={() => press(index)}
        >
          {button.label}
        </Button>
      {/if}
    {/each}
  </div>

  {#if confirming !== null}
    {@const confirm = block.buttons[confirming]?.confirm}
    {#if confirm}
      <div
        id="{uid}-confirm"
        class="grid gap-2 rounded-md border border-border bg-muted/50 p-3"
        role="alertdialog"
        aria-modal="false"
        aria-labelledby="{uid}-confirm-title"
        aria-describedby="{uid}-confirm-body"
        tabindex="-1"
        onkeydown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            void cancel();
          }
        }}
      >
        <p id="{uid}-confirm-title" class="m-0 text-sm font-semibold">{confirm.title}</p>
        <p id="{uid}-confirm-body" class="m-0 whitespace-pre-wrap text-sm text-muted-foreground">{confirm.body}</p>
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" bind:ref={cancelButton} autoLoading={false} onclick={cancel}>
            {confirm.cancelLabel}
          </Button>
          <Button
            variant={block.buttons[confirming]?.style === 'danger' ? 'destructive' : 'default'}
            autoLoading={false}
            onclick={() => run(confirming as number)}
          >
            {confirm.confirmLabel}
          </Button>
        </div>
      </div>
    {/if}
  {/if}

  {#if !onAction && block.buttons.some((button) => button.action)}
    <p class="m-0 text-xs text-muted-foreground">Actions are not available in this view.</p>
  {/if}
  {#if error}
    <p class="m-0 text-xs text-destructive" role="alert">{error}</p>
  {/if}
</div>
