<script lang="ts">
import type { SelectBlock } from '@protoyard/ai/messages';
import { Button } from 'texuli/button';
import { Checkbox } from 'texuli/choice';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger, SelectValue } from 'texuli/select';
import { type MessageActionHandler, settle } from './types.ts';

/**
 * A choice, drawn with Texuli controls. A single select (`texuli/select`)
 * reports `{ kind: 'select' }` as soon as it changes; a multiple select is a
 * group of Texuli checkboxes with a Send button. A failed report restores the
 * previous choice and shows why.
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
      {#each block.options as option (option.value)}
        <Checkbox
          label={option.label}
          description={option.description}
          value={option.value}
          checked={selected.includes(option.value)}
          disabled={!onAction || pending}
          onCheckedChange={(checked) => toggle(option.value, checked)}
        />
      {/each}
    </fieldset>
    <div>
      <!-- Pending is the component's own state (it also locks the choices), so autoLoading is off. -->
      <Button
        autoLoading={false}
        loading={pending}
        disabled={!onAction || pending || selected.length === 0}
        onclick={() => send(selected)}
      >
        Send
      </Button>
    </div>
  {:else}
    <label class="text-sm font-medium" for="{uid}-select">{block.label ?? block.placeholder}</label>
    <SelectRoot
      value={selected[0] ?? ''}
      items={block.options.map((option) => ({ value: option.value, label: option.label }))}
      disabled={!onAction || pending}
      onValueChange={(value) => {
        selected = value ? [value] : [];
        if (value) void send([value]);
      }}
    >
      <SelectTrigger id="{uid}-select" class="w-full max-w-sm" aria-busy={pending ? 'true' : undefined}>
        <SelectValue placeholder={block.placeholder} />
      </SelectTrigger>
      <SelectContent>
        {#each block.options as option (option.value)}
          <SelectItem value={option.value} label={option.label} description={option.description}>
            {option.label}
          </SelectItem>
        {/each}
      </SelectContent>
    </SelectRoot>
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
