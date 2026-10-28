<script lang="ts">
import { ArrowLeft, ArrowRight, ChevronUp, RefreshCw, ThumbsDown, ThumbsUp } from '@lucide/svelte';
import { ChatMessageDisplay } from '@texuli/chat';
import { Badge } from 'texuli/badge';
import { Button, IconButton } from 'texuli/button';
import { LucideIcon } from 'texuli/icons/lucide';
import { Textarea } from 'texuli/input';
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

function saveEdit(message: AssistantMessage): void {
  const content = editDraft.trim();
  if (content) onEditMessage?.(message.id, content);
  editingId = '';
}
</script>

<!--
  Each message is @texuli/chat's ChatMessageDisplay. The list itself stays
  Protoyard's: @texuli/chat's MessageList owns its viewport and has no
  per-conversation scroll anchor, action row or edit mode (Texuli gap, see the
  lane-C map), so the virtual window and anchor below are kept (virtual.ts).
-->
<div
  bind:this={viewport}
  class="@container min-h-0 flex-1 overflow-y-auto px-4 py-5 @xl:px-8"
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
        <!-- The outer article keeps ai-ui's names ("Your message", "Assistant message") that hosts and E2E address. -->
        <article
          use:observeMessage={message.id}
          class="group min-w-0 pb-8"
          aria-label={message.role === 'user' ? 'Your message' : 'Assistant message'}
          data-message-role={message.role}
          style={`position:absolute;top:${item.start}px;left:0;right:0`}
        >
          {#if message.role === 'user'}
            <ChatMessageDisplay author="You" role="user" at={message.createdAt} text={editingId === message.id ? undefined : message.content}>
              {#if editingId === message.id}
                <form class="w-full min-w-72 space-y-2" onsubmit={(event) => { event.preventDefault(); saveEdit(message); }}>
                  <label for={`edit-${message.id}`} class="sr-only">Edit your message</label>
                  <Textarea id={`edit-${message.id}`} bind:value={editDraft} rows={4} />
                  <div class="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onclick={() => (editingId = '')}>Cancel</Button>
                    <Button type="submit" size="sm" disabled={!onEditMessage || !editDraft.trim()}>Save and resend</Button>
                  </div>
                </form>
              {:else if onEditMessage}
                <Button
                  variant="ghost"
                  size="sm"
                  class="text-xs opacity-100 transition-[color,background-color,border-color,box-shadow] @xl:opacity-0 @xl:group-hover:opacity-100 @xl:focus-visible:opacity-100"
                  aria-label="Edit your message"
                  onclick={() => { editingId = message.id; editDraft = message.content; }}
                ><LucideIcon icon={ChevronUp} size="xs" /> Edit</Button>
              {/if}
            </ChatMessageDisplay>
          {:else}
            <ChatMessageDisplay author="Assistant" role="agent" at={message.createdAt}>
              <Badge variant="outline" label="Simulated" class="mb-1" />
              <RichAnswer content={message.content} />
              <div class="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground opacity-100 @xl:opacity-0 @xl:group-hover:opacity-100 @xl:focus-within:opacity-100">
                {#if onFeedback}
                  <Button variant="ghost" size="sm" class={message.feedback === 'up' ? 'text-primary' : ''} aria-label="Helpful response" aria-pressed={message.feedback === 'up'} onclick={() => onFeedback?.(message.id, 'up')}><LucideIcon icon={ThumbsUp} size="xs" />Helpful</Button>
                  <Button variant="ghost" size="sm" class={message.feedback === 'down' ? 'text-primary' : ''} aria-label="Not helpful response" aria-pressed={message.feedback === 'down'} onclick={() => onFeedback?.(message.id, 'down')}><LucideIcon icon={ThumbsDown} size="xs" />Not helpful</Button>
                {/if}
                {#if message.branchCount && message.branchCount > 1}
                  <span class="ml-1 inline-flex items-center gap-1">
                    <IconButton variant="ghost" size="sm" label="Previous response version" disabled={message.branchIndex === 0 || !onBranchChange} onclick={() => onBranchChange?.(message.id, -1)}><LucideIcon icon={ArrowLeft} size="xs" /></IconButton>
                    <span>{(message.branchIndex ?? 0) + 1} / {message.branchCount}</span>
                    <IconButton variant="ghost" size="sm" label="Next response version" disabled={(message.branchIndex ?? 0) >= message.branchCount - 1 || !onBranchChange} onclick={() => onBranchChange?.(message.id, 1)}><LucideIcon icon={ArrowRight} size="xs" /></IconButton>
                  </span>
                {/if}
                {#if lastAssistantId === message.id && onRegenerate}
                  <Button variant="ghost" size="sm" disabled={streaming} aria-label="Regenerate response" onclick={onRegenerate}><LucideIcon icon={RefreshCw} size="xs" /> Regenerate</Button>
                {/if}
              </div>
              {#if lastAssistantId === message.id && streaming}<p class="mt-2 text-xs text-muted-foreground" aria-live="polite">Writing…</p>{/if}
            </ChatMessageDisplay>
          {/if}
        </article>
      {/if}
    {/each}
  </div>
</div>
