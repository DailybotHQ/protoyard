<script lang="ts">
import { SendHorizontal } from '@lucide/svelte';
import type { Snippet } from 'svelte';
import { cn } from '../../lib/cn.ts';
import Spinner from '../spinner/Spinner.svelte';

interface Props {
  value?: string;
  /** Return `false` (or reject) to keep the draft, e.g. on validation failure. */
  onSubmit: (value: string) => unknown;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  /** External sending state; async `onSubmit` also shows it automatically. */
  sending?: boolean;
  maxRows?: number;
  maxLength?: number;
  /** Extra controls left of the send button (attach, emoji…). */
  actions?: Snippet;
  class?: string;
}

const uid = $props.id();

let {
  value = $bindable(''),
  onSubmit,
  placeholder = 'Write a message…',
  label = 'Message',
  disabled = false,
  sending = false,
  maxRows = 6,
  maxLength,
  actions,
  class: className,
}: Props = $props();

let textarea = $state<HTMLTextAreaElement | null>(null);
let pending = $state(false);
const busy = $derived(sending || pending);
const canSend = $derived(!disabled && !busy && value.trim().length > 0);
const hintId = `composer-${uid}-hint`;

function resize(): void {
  const el = textarea;
  if (!el) return;
  el.style.height = 'auto';
  const line = Number.parseFloat(getComputedStyle(el).lineHeight) || 20;
  const max = line * maxRows + 16;
  el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
}

$effect(() => {
  // Re-measure when the value changes programmatically (e.g. cleared after sending).
  void value;
  resize();
});

async function submit(): Promise<void> {
  if (!canSend) return;
  const text = value.trim();
  pending = true;
  try {
    const result = await onSubmit(text);
    if (result !== false) value = '';
  } catch {
    // Keep the draft so nothing typed is lost; the caller surfaces the error.
  } finally {
    pending = false;
    textarea?.focus();
  }
}

function handleKeydown(event: KeyboardEvent): void {
  // IME composition uses Enter to confirm characters, so never send mid-composition.
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    void submit();
  }
}
</script>

<form
  class={cn(
    'flex items-end gap-2 rounded-xl border border-input bg-surface p-2 shadow-soft transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30',
    disabled && 'opacity-60',
    className
  )}
  onsubmit={(event) => {
    event.preventDefault();
    void submit();
  }}
>
  <label for={`composer-${uid}`} class="sr-only">{label}</label>
  <textarea
    bind:this={textarea}
    bind:value
    id={`composer-${uid}`}
    rows="1"
    {placeholder}
    {disabled}
    maxlength={maxLength}
    aria-describedby={hintId}
    class="max-h-60 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-base leading-5 text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed sm:text-sm"
    oninput={resize}
    onkeydown={handleKeydown}
  ></textarea>
  <span id={hintId} class="sr-only">Press Enter to send, Shift+Enter for a new line.</span>
  {@render actions?.()}
  <button
    type="submit"
    disabled={!canSend}
    aria-busy={busy || undefined}
    class="inline-flex size-9 min-h-touch min-w-[44px] shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-soft transition-[background-color,opacity] hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40 sm:min-h-0 sm:min-w-0"
  >
    {#if busy}<Spinner />{:else}<SendHorizontal class="size-4" aria-hidden="true" />{/if}
    <span class="sr-only">{busy ? 'Sending…' : 'Send message'}</span>
  </button>
</form>
