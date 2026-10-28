<script lang="ts">
import { SendHorizontal, Square } from '@lucide/svelte';
import { Button, Spinner, Textarea } from '@protoyard/ui';
import { tick } from 'svelte';
import { LucideIcon } from 'texuli/icons/lucide';
import type { Agent } from '../database/schema.ts';
import { activeMention, addMention, applyMention, type MentionQuery } from '../lib/mentions.ts';

/**
 * Message composer with @mention autocomplete (ARIA combobox pattern),
 * Enter to send, Shift+Enter for a newline and a Stop button while agents stream.
 */
let {
  value = $bindable(''),
  agents,
  onSend,
  onStop,
  streaming = false,
  disabled = false,
  disabledReason = '',
}: {
  value?: string;
  agents: readonly Agent[];
  /** Resolve `true` to clear the draft; `false` keeps it (e.g. offline). */
  onSend: (text: string) => Promise<boolean>;
  onStop?: () => void;
  streaming?: boolean;
  disabled?: boolean;
  disabledReason?: string;
} = $props();

const uid = $props.id();
const inputId = `composer-${uid}`;
const listId = `mentions-${uid}`;
const hintId = `composer-hint-${uid}`;

let textarea = $state<HTMLTextAreaElement | null>(null);
let mention = $state<MentionQuery | null>(null);
let highlighted = $state(0);
let sending = $state(false);

const suggestions = $derived(
  mention
    ? agents.filter(
        (a) =>
          a.handle.startsWith(mention?.query.toLowerCase() ?? '') ||
          a.name.toLowerCase().startsWith(mention?.query.toLowerCase() ?? '')
      )
    : []
);
const open = $derived(suggestions.length > 0);
const canSend = $derived(!disabled && !sending && value.trim().length > 0);

export function focus(): void {
  textarea?.focus();
}

/** Inserts `@handle` from a helper chip and returns focus to the draft. */
export async function mentionAgent(handle: string): Promise<void> {
  value = addMention(value, handle);
  await tick();
  textarea?.focus();
  textarea?.setSelectionRange(value.length, value.length);
}

function resize(): void {
  const el = textarea;
  if (!el) return;
  el.style.height = 'auto';
  const max = 180;
  el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
}

$effect(() => {
  void value;
  resize();
});

function refreshMention(): void {
  const el = textarea;
  if (!el) return;
  const next = activeMention(el.value, el.selectionStart ?? el.value.length);
  if (next?.start !== mention?.start || next?.query !== mention?.query) highlighted = 0;
  mention = next;
}

async function choose(agent: Agent): Promise<void> {
  if (!mention) return;
  const result = applyMention(value, mention, agent.handle);
  value = result.text;
  mention = null;
  await tick();
  textarea?.focus();
  textarea?.setSelectionRange(result.caret, result.caret);
}

async function submit(): Promise<void> {
  if (!canSend) return;
  sending = true;
  const text = value.trim();
  try {
    if (await onSend(text)) value = '';
  } finally {
    sending = false;
    mention = null;
    await tick();
    textarea?.focus();
  }
}

function onkeydown(event: KeyboardEvent): void {
  if (open) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      highlighted = (highlighted + step + suggestions.length) % suggestions.length;
      return;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      const agent = suggestions[highlighted];
      if (agent) {
        event.preventDefault();
        void choose(agent);
        return;
      }
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      mention = null;
      return;
    }
  }
  // IME composition confirms characters with Enter: never send mid-composition.
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    void submit();
  }
}
</script>

<div class="relative">
  {#if open}
    <ul
      id={listId}
      role="listbox"
      aria-label="Mention an agent"
      class="absolute bottom-full left-0 z-20 mb-2 w-72 max-w-full overflow-hidden rounded-lg border border-border bg-elevated p-1 shadow-float"
    >
      {#each suggestions as agent, i (agent.id)}
        <li
          id={`${listId}-${agent.id}`}
          role="option"
          aria-selected={i === highlighted}
          class={[
            'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm',
            i === highlighted ? 'bg-primary/15 text-foreground' : 'text-muted-foreground',
          ]}
          onmousedown={(event) => {
            // Keep focus in the textarea while picking with the mouse.
            event.preventDefault();
            void choose(agent);
          }}
          onmouseenter={() => (highlighted = i)}
        >
          <span class="size-2.5 shrink-0 rounded-full" style:background-color={agent.color} aria-hidden="true"></span>
          <span class="font-medium text-foreground">@{agent.handle}</span>
          <span class="truncate text-xs">{agent.description.split(' — ')[0]}</span>
        </li>
      {/each}
    </ul>
  {/if}

  <form
    class={[
      'flex items-end gap-2 rounded-xl border border-input bg-surface p-2 shadow-soft transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30',
      disabled && 'opacity-70',
    ]}
    onsubmit={(event) => {
      event.preventDefault();
      void submit();
    }}
  >
    <label for={inputId} class="sr-only">Message</label>
    <Textarea
      bind:ref={textarea}
      bind:value
      id={inputId}
      data-py-composer=""
      rows={1}
      maxlength={4000}
      {disabled}
      placeholder={disabled ? disabledReason : 'Message the team — type @ to mention an agent'}
      aria-controls={open ? listId : undefined}
      aria-autocomplete="list"
      aria-activedescendant={open && suggestions[highlighted] ? `${listId}-${suggestions[highlighted]?.id}` : undefined}
      aria-describedby={hintId}
      class="max-h-[180px] min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-base leading-5 text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed sm:text-sm"
      oninput={refreshMention}
      onclick={refreshMention}
      onkeyup={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') refreshMention();
      }}
      onblur={() => (mention = null)}
      {onkeydown}
    ></Textarea>
    <span id={hintId} class="sr-only">
      {disabled ? disabledReason : 'Press Enter to send, Shift+Enter for a new line. Type @ to mention an agent.'}
    </span>
    {#if streaming && onStop}
      <Button
        type="button"
        onclick={onStop}
        class="inline-flex h-9 min-h-touch shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:min-h-0"
      >
        <LucideIcon icon={Square} class="size-3.5 fill-current" /> Stop
      </Button>
    {/if}
    <Button
      type="submit"
      disabled={!canSend}
      aria-busy={sending || undefined}
      class="inline-flex size-9 min-h-touch min-w-[44px] shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-soft hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40 sm:min-h-0 sm:min-w-0"
    >
      {#if sending}<Spinner />{:else}<LucideIcon icon={SendHorizontal} class="size-4" />{/if}
      <span class="sr-only">{sending ? 'Sending…' : 'Send message'}</span>
    </Button>
  </form>
</div>
