<script lang="ts">
import { LoaderCircle } from '@lucide/svelte';
import type { SelectBlock } from '@protoyard/ai/messages';
import { type MessageActionHandler, settle } from './types.ts';

/**
 * A choice. A single select reports `{ kind: 'select' }` as soon as it
 * changes; a multiple select is a checkbox group with a Send button. A failed
 * report restores the previous choice and shows why.
 */
let {
  block,
  blockIndex,
  messageId,
  onAction,
}: {
  block: SelectBlock;
  blockIndex: number;
  messageId: string | null;
  onAction?: MessageActionHandler;
} = $props();

const uid = $props.id();
// The block is fixed for this component's life; the initial choice is a starting value only.
// svelte-ignore state_referenced_locally
let selected = $state<string[]>([...(block.initial ?? [])]);
// svelte-ignore state_referenced_locally
let committed = $state<string[]>([...(block.initial ?? [])]);
let pending = $state(false);
let error = $state('');
let sent = $state(false);

async function send(values: string[]): Promise<void> {
  if (!onAction || pending) return;
  pending = true;
  error = '';
  const failure = await settle(() =>
    onAction({ kind: 'select', messageId, blockIndex, action: block.action, values: [...values] })
  );
  pending = false;
  if (failure) {
    error = failure;
    selected = [...committed];
  } else {
    committed = [...values];
    sent = true;
  }
}

function toggle(value: string, checked: boolean): void {
  sent = false;
  selected = checked ? [...selected, value] : selected.filter((v) => v !== value);
}
</script>

<div class="grid gap-2" data-py-message-block="select">
  {#if block.multiple}
    <fieldset class="m-0 grid gap-1.5 border-0 p-0" disabled={!onAction || pending}>
      <legend class="mb-1 text-sm font-medium">{block.label ?? block.placeholder}</legend>
      {#each block.options as option, index (option.value)}
        <label class="flex min-h-touch items-start gap-2 text-sm sm:min-h-0">
          <input
            type="checkbox"
            class="mt-1 size-4 accent-primary"
            checked={selected.includes(option.value)}
            aria-describedby={option.description ? `${uid}-opt-${index}` : undefined}
            onchange={(event) => toggle(option.value, event.currentTarget.checked)}
          />
          <span>
            {option.label}
            {#if option.description}
              <span id="{uid}-opt-{index}" class="block text-xs text-muted-foreground">{option.description}</span>
            {/if}
          </span>
        </label>
      {/each}
    </fieldset>
    <div>
      <button
        type="button"
        class="inline-flex min-h-touch items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9"
        disabled={!onAction || pending || selected.length === 0}
        aria-busy={pending ? 'true' : undefined}
        onclick={() => send(selected)}
      >
        {#if pending}<LoaderCircle class="size-3.5 motion-safe:animate-spin" aria-hidden="true" />{/if}
        Send
      </button>
    </div>
  {:else}
    <label class="grid gap-1 text-sm" for="{uid}-select">
      <span class="font-medium">{block.label ?? block.placeholder}</span>
    </label>
    <select
      id="{uid}-select"
      class="min-h-touch w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 sm:min-h-9"
      disabled={!onAction || pending}
      aria-busy={pending ? 'true' : undefined}
      value={selected[0] ?? ''}
      onchange={(event) => {
        const value = event.currentTarget.value;
        selected = value ? [value] : [];
        if (value) void send([value]);
      }}
    >
      <option value="" disabled>{block.placeholder}</option>
      {#each block.options as option (option.value)}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  {/if}

  <p class="m-0 min-h-4 text-xs text-muted-foreground" role="status" aria-live="polite">
    {#if pending}Sending…{:else if sent}Sent.{/if}
  </p>
  {#if !onAction}
    <p class="m-0 text-xs text-muted-foreground">Choices are not available in this view.</p>
  {/if}
  {#if error}
    <p class="m-0 text-xs text-destructive" role="alert">{error}</p>
  {/if}
</div>
