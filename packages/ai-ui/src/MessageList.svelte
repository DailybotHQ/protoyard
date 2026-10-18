<script lang="ts">
import { ArrowLeft, ArrowRight, ChevronUp, RefreshCw, ThumbsDown, ThumbsUp } from '@lucide/svelte';
import RichAnswer from './components/RichAnswer.svelte';
import type { AssistantMessage, FeedbackRating } from './types.ts';
import {
  calculateVirtualWindow,
  captureScrollAnchor,
  loadScrollAnchor,
  restoreScrollAnchor,
  type ScrollAnchor,
  saveScrollAnchor,
} from './virtual.ts';

interface Props {
  messages: readonly AssistantMessage[];
  conversationId: string;
  streaming?: boolean;
  onRegenerate?: () => void;
  onEditMessage?: (messageId: string, content: string) => void;
  onBranchChange?: (messageId: string, direction: -1 | 1) => void;
  onFeedback?: (messageId: string, rating: FeedbackRating) => void;
}

let {
  messages,
  conversationId,
  streaming = false,
  onRegenerate,
  onEditMessage,
  onBranchChange,
  onFeedback,
}: Props = $props();
let viewport = $state<HTMLDivElement | null>(null);
let scrollTop = $state(0);
let viewportHeight = $state(0);
let measuredHeights = $state<Record<string, number>>({});
let editingId = $state('');
let editDraft = $state('');
let anchor = $state<ScrollAnchor | null>(null);
let stickToBottom = $state(true);
let activeConversation = '';

const heights = $derived(messages.map((message) => measuredHeights[message.id] ?? 0));
const windowed = $derived(
  calculateVirtualWindow(messages.length, scrollTop, viewportHeight, heights)
);
const lastAssistantId = $derived(
  [...messages].reverse().find((message) => message.role === 'assistant')?.id
);
const storageKey = $derived(`protoyard:ai-ui:scroll:${conversationId}`);

$effect(() => {
  const id = conversationId;
  if (!viewport || !id || id === activeConversation) return;
  activeConversation = id;
  anchor = loadScrollAnchor(storageKey);
  stickToBottom = !anchor;
  requestAnimationFrame(() => {
    if (!viewport) return;
    viewport.scrollTop = anchor
      ? restoreScrollAnchor(
          messages.map((message) => message.id),
          anchor,
          heights
        )
      : viewport.scrollHeight;
    scrollTop = viewport.scrollTop;
    viewportHeight = viewport.clientHeight;
  });
});

$effect(() => {
  const currentMessages = messages;
  const currentHeights = heights;
  const currentId = conversationId;
  if (!viewport || !currentId || activeConversation !== currentId) return;
  if (stickToBottom) {
    viewport.scrollTop = viewport.scrollHeight;
    scrollTop = viewport.scrollTop;
    return;
  }
  if (anchor) {
    const nextTop = restoreScrollAnchor(
      currentMessages.map((message) => message.id),
      anchor,
      currentHeights
    );
    if (Math.abs(viewport.scrollTop - nextTop) > 1) viewport.scrollTop = nextTop;
    scrollTop = viewport.scrollTop;
  }
});

function onScroll(): void {
  if (!viewport) return;
  scrollTop = viewport.scrollTop;
  viewportHeight = viewport.clientHeight;
  stickToBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 48;
  anchor = captureScrollAnchor(
    messages.map((message) => message.id),
    viewport.scrollTop,
    heights
  );
  saveScrollAnchor(storageKey, anchor);
}

function observeMessage(node: HTMLElement, id: string) {
  const observer =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(([entry]) => {
          if (!entry) return;
          const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
          if (height > 0 && measuredHeights[id] !== height)
            measuredHeights = { ...measuredHeights, [id]: height };
        });
  observer?.observe(node);
  return { destroy: () => observer?.disconnect() };
}

function formatDate(date: string): string {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(value);
}

function saveEdit(message: AssistantMessage): void {
  const content = editDraft.trim();
  if (content) onEditMessage?.(message.id, content);
  editingId = '';
}
</script>

<div
  bind:this={viewport}
  class="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8"
  role="log"
  aria-label="Conversation messages"
  aria-live="polite"
  tabindex="0"
  onscroll={onScroll}
>
  <div class="mx-auto max-w-3xl pb-6" style={`height:${windowed.totalSize}px;position:relative`}>
    {#each windowed.items as item (messages[item.index]?.id)}
      {@const message = messages[item.index]}
      {#if message}
        <article
          use:observeMessage={message.id}
          class={`group min-w-0 pb-8 ${message.role === 'user' ? 'ml-auto max-w-[92%] sm:max-w-[85%]' : 'max-w-full'}`}
          aria-label={message.role === 'user' ? 'Your message' : 'Assistant message'}
          style={`position:absolute;top:${item.start}px;left:0;right:0`}
        >
          <div class="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span class="font-medium text-foreground">{message.role === 'user' ? 'You' : 'Assistant'}</span>
            {#if message.role === 'assistant'}<span class="rounded-full border border-border px-2 py-0.5 text-[0.62rem]">Simulated</span>{/if}
            <time class="ml-auto" datetime={message.createdAt}>{formatDate(message.createdAt)}</time>
          </div>
          {#if editingId === message.id}
            <form class="space-y-2" onsubmit={(event) => { event.preventDefault(); saveEdit(message); }}>
              <label for={`edit-${message.id}`} class="sr-only">Edit your message</label>
              <textarea id={`edit-${message.id}`} bind:value={editDraft} rows="4" class="w-full rounded-xl border border-border bg-surface p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"></textarea>
              <div class="flex justify-end gap-2"><button type="button" class="min-h-10 rounded-lg px-3 text-xs hover:bg-muted" onclick={() => (editingId = '')}>Cancel</button><button type="submit" class="min-h-10 rounded-lg bg-primary px-3 text-xs text-primary-foreground disabled:opacity-40" disabled={!onEditMessage || !editDraft.trim()}>Save and resend</button></div>
            </form>
          {:else if message.role === 'user'}
            <div class="rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground whitespace-pre-wrap">{message.content}</div>
            {#if onEditMessage}<button type="button" class="mt-1 min-h-9 rounded-lg px-2 text-xs text-muted-foreground opacity-100 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100" aria-label="Edit your message" onclick={() => { editingId = message.id; editDraft = message.content; }}><span class="inline-flex items-center gap-1"><ChevronUp class="size-3" aria-hidden="true" /> Edit</span></button>{/if}
          {:else}
            <RichAnswer content={message.content} />
            <div class="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
              {#if onFeedback}<button type="button" class={`inline-flex min-h-9 items-center gap-1 rounded-lg px-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${message.feedback === 'up' ? 'text-primary' : ''}`} aria-label="Helpful response" aria-pressed={message.feedback === 'up'} onclick={() => onFeedback?.(message.id, 'up')}><ThumbsUp class="size-3.5" aria-hidden="true" />Helpful</button><button type="button" class={`inline-flex min-h-9 items-center gap-1 rounded-lg px-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${message.feedback === 'down' ? 'text-primary' : ''}`} aria-label="Unhelpful response" aria-pressed={message.feedback === 'down'} onclick={() => onFeedback?.(message.id, 'down')}><ThumbsDown class="size-3.5" aria-hidden="true" />Not helpful</button>{/if}
              {#if message.branchCount && message.branchCount > 1}<span class="ml-1 inline-flex items-center gap-1"><button type="button" class="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted disabled:opacity-40" aria-label="Previous response version" disabled={message.branchIndex === 0 || !onBranchChange} onclick={() => onBranchChange?.(message.id, -1)}><ArrowLeft class="size-3.5" aria-hidden="true" /></button><span>{(message.branchIndex ?? 0) + 1} / {message.branchCount}</span><button type="button" class="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted disabled:opacity-40" aria-label="Next response version" disabled={(message.branchIndex ?? 0) >= message.branchCount - 1 || !onBranchChange} onclick={() => onBranchChange?.(message.id, 1)}><ArrowRight class="size-3.5" aria-hidden="true" /></button></span>{/if}
              {#if lastAssistantId === message.id && onRegenerate}<button type="button" class="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={streaming} aria-label="Regenerate response" onclick={onRegenerate}><RefreshCw class="size-3.5" aria-hidden="true" /> Regenerate</button>{/if}
            </div>
          {/if}
          {#if message.role === 'assistant' && lastAssistantId === message.id && streaming}<p class="mt-2 text-xs text-muted-foreground" aria-live="polite">Writing…</p>{/if}
        </article>
      {/if}
    {/each}
  </div>
</div>
