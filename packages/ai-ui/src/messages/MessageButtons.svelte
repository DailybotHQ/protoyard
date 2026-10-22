<script lang="ts">
import { ExternalLink, LoaderCircle } from '@lucide/svelte';
import type { ButtonsBlock, MessageButton } from '@protoyard/ai/messages';
import { tick } from 'svelte';
import { type MessageActionHandler, settle } from './types.ts';

/**
 * Action and link buttons. An action button reports `{ kind: 'button' }` and
 * stays busy while the host's promise is pending; a confirmation asks first,
 * inline, with Cancel focused. Link buttons open in a new tab without access
 * to this page (`noopener noreferrer`).
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
let cancelButton = $state<HTMLButtonElement | null>(null);
const triggers: (HTMLButtonElement | null)[] = $state([]);

const STYLE: Record<MessageButton['style'], string> = {
  default: 'border border-border bg-background text-foreground hover:bg-muted',
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
};
const BASE =
  'inline-flex min-h-touch items-center gap-1.5 rounded-md px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9';

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
        <a
          class="{BASE} {STYLE[button.style]}"
          href={button.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {button.label}
          <ExternalLink class="size-3.5" aria-hidden="true" />
          <span class="sr-only">(opens in a new tab)</span>
        </a>
      {:else}
        <button
          type="button"
          class="{BASE} {STYLE[button.style]}"
          bind:this={triggers[index]}
          disabled={!onAction || pending !== null}
          aria-busy={pending === index ? 'true' : undefined}
          aria-expanded={button.confirm ? confirming === index : undefined}
          aria-controls={button.confirm ? `${uid}-confirm` : undefined}
          onclick={() => press(index)}
        >
          {#if pending === index}
            <LoaderCircle class="size-3.5 motion-safe:animate-spin" aria-hidden="true" />
          {/if}
          {button.label}
        </button>
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
          <button
            type="button"
            class="{BASE} {STYLE.default}"
            bind:this={cancelButton}
            onclick={cancel}
          >
            {confirm.cancelLabel}
          </button>
          <button
            type="button"
            class="{BASE} {STYLE[block.buttons[confirming]?.style === 'danger' ? 'danger' : 'primary']}"
            onclick={() => run(confirming as number)}
          >
            {confirm.confirmLabel}
          </button>
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
