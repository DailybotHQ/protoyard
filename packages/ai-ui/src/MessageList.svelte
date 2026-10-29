<script lang="ts">
import { ArrowLeft, ArrowRight, ChevronUp, RefreshCw, ThumbsDown, ThumbsUp } from '@lucide/svelte';
import { type ChatMessage, MessageList as TexuliMessageList } from '@texuli/chat';
import { Badge } from 'texuli/badge';
import { Button, IconButton } from 'texuli/button';
import { LucideIcon } from 'texuli/icons/lucide';
import RichAnswer from './components/RichAnswer.svelte';
import {
  captureScrollAnchor,
  clearScrollAnchor,
  loadScrollAnchor,
  restoreScrollAnchor,
  saveScrollAnchor,
} from './scroll-anchor.ts';
import type { AssistantMessage, FeedbackRating } from './types.ts';

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

const USER = { id: 'user', name: 'You' };
const ASSISTANT = { id: 'assistant', name: 'Assistant' };
/** The reader is this close to the bottom: the conversation reopens at the latest message. */
const BOTTOM_SLACK = 96;

let root = $state<HTMLDivElement | null>(null);
const lastAssistantId = $derived(
  [...messages].reverse().find((message) => message.role === 'assistant')?.id
);
const byId = $derived(new Map(messages.map((message) => [message.id, message])));
const chatMessages = $derived(
  messages.map(
    (message): ChatMessage => ({
      id: message.id,
      author: message.role === 'user' ? USER : ASSISTANT,
      body: message.content,
      at: message.createdAt,
      streaming: streaming && message.id === lastAssistantId,
    })
  )
);
const storageKey = $derived(`protoyard:ai-ui:scroll:${conversationId}`);

function viewportOf(element: HTMLElement | null): HTMLElement | null {
  return element?.querySelector<HTMLElement>('[data-tx-chat-message-list]') ?? null;
}

/** Frames the restored position must hold before the reader's own scrolling is remembered again. */
const SETTLE_FRAMES = 3;
/** Longest restore (about 1 s at 60 Hz): late content (a chart, an image) has landed by then. */
const MAX_RESTORE_FRAMES = 60;

/*
 * Texuli's MessageList follows the stream and offers jump-to-latest; the
 * reading position per conversation stays Protoyard's. The list is keyed by
 * conversation, so switching remounts it, and the saved anchor is restored
 * once Texuli has made its first stick to the bottom.
 *
 * Until the reader scrolls, Texuli still sticks to the bottom whenever content
 * resizes (a lazy chart answer, an image). So the restore keeps re-applying
 * the anchor every frame until the position has held for a few frames, and
 * scroll events in that time are the restore's, not the reader's: they never
 * save or clear the anchor. A wheel, touch, key or pointer press is the
 * reader taking over, which ends the restore at once.
 */
$effect(() => {
  const key = storageKey;
  const viewport = viewportOf(root);
  if (!viewport) return;
  const anchor = loadScrollAnchor(key);
  let frame = 0;
  let restoring = anchor !== null;
  const stopRestoring = () => {
    restoring = false;
    cancelAnimationFrame(frame);
  };
  if (anchor) {
    // A miss (the row is outside the virtual window) moves to the raw position; a later
    // frame places the row exactly once the window has re-rendered there.
    let frames = 0;
    let held = 0;
    let last = Number.NaN;
    const restore = () => {
      if (!restoring) return;
      frames += 1;
      const placed = restoreScrollAnchor(viewport, anchor);
      held = placed && Math.abs(viewport.scrollTop - last) < 1 ? held + 1 : 0;
      last = viewport.scrollTop;
      if (held >= SETTLE_FRAMES || frames >= MAX_RESTORE_FRAMES) restoring = false;
      else frame = requestAnimationFrame(restore);
    };
    // Two frames first: after Texuli's own first stick to the bottom.
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(restore);
    });
  }
  const remember = () => {
    if (restoring) return;
    const atBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < BOTTOM_SLACK;
    if (atBottom) clearScrollAnchor(key);
    else saveScrollAnchor(key, captureScrollAnchor(viewport));
  };
  const intents = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
  for (const type of intents) viewport.addEventListener(type, stopRestoring, { passive: true });
  viewport.addEventListener('scroll', remember, { passive: true });
  return () => {
    cancelAnimationFrame(frame);
    for (const type of intents) viewport.removeEventListener(type, stopRestoring);
    viewport.removeEventListener('scroll', remember);
  };
});
</script>

<!--
  @texuli/chat's MessageList: virtual window, stream follow, jump to latest,
  per-message actions and inline edit. ai-ui keeps its names ("Conversation
  messages", "Your message", "Assistant message") that hosts and E2E address,
  the rich answer body, and the per-conversation reading position. The group
  row wraps so a day separator spans the list instead of sitting beside the
  avatar (Texuli 0.5.0 places it inside the row; reported as a Texuli gap).
-->
<div bind:this={root} class="@container flex min-h-0 flex-1 flex-col overflow-hidden">
  {#key conversationId}
    <TexuliMessageList
      messages={chatMessages}
      currentUserId={USER.id}
      label="Conversation messages"
      emptyText="No messages yet. Ask the simulated assistant anything."
      labels={{ editInput: 'Edit your message', saveEdit: 'Save and resend' }}
      onEdit={onEditMessage ? (message, body) => onEditMessage(message.id, body) : undefined}
      class="px-4 py-5 @xl:px-8 [&_.tx-chat-message-group]:flex-wrap [&_.tx-chat-message-list\_\_day]:basis-full"
    >
      {#snippet body(chat)}
        {@const message = byId.get(chat.id)}
        {#if message?.role === 'assistant'}
          <article class="min-w-0 whitespace-normal" aria-label="Assistant message" data-message-role="assistant" data-py-message-id={chat.id}>
            <Badge variant="outline" label="Simulated" class="mb-1" />
            <RichAnswer content={chat.body} />
            {#if chat.streaming}<p class="mt-2 text-xs text-muted-foreground">Writing…</p>{/if}
          </article>
        {:else}
          <article class="min-w-0" aria-label="Your message" data-message-role="user" data-py-message-id={chat.id}>{chat.body}</article>
        {/if}
      {/snippet}
      {#snippet actions(chat, controls)}
        {@const message = byId.get(chat.id)}
        {#if message?.role === 'user'}
          {#if controls.canEdit}
            <Button variant="ghost" size="sm" class="text-xs" aria-label="Edit your message" onclick={controls.edit}><LucideIcon icon={ChevronUp} size="xs" /> Edit</Button>
          {/if}
        {:else if message}
          <div class="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
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
        {/if}
      {/snippet}
    </TexuliMessageList>
  {/key}
</div>
