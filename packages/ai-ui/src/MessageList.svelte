<script lang="ts">
import { ArrowLeft, ArrowRight, ChevronUp, RefreshCw, ThumbsDown, ThumbsUp } from '@lucide/svelte';
import { type ChatMessage, MessageList as TexuliMessageList } from '@texuli/chat';
import { Badge } from 'texuli/badge';
import { Button, IconButton } from 'texuli/button';
import { LucideIcon } from 'texuli/icons/lucide';
import RichAnswer from './components/RichAnswer.svelte';
import { loadReadingAnchor, readingAnchorKey, saveReadingAnchor } from './scroll-anchor.ts';
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
const storageKey = $derived(readingAnchorKey(conversationId));
</script>

<!--
  @texuli/chat's MessageList: virtual window, stream follow, jump to latest,
  per-message actions, inline edit, full-width day separators (G70) and the
  reading position (G71). ai-ui keeps its names ("Conversation messages",
  "Your message", "Assistant message") that hosts and E2E address, the rich
  answer body, and where each conversation's position is stored: the list is
  keyed by conversation, so switching remounts it with that conversation's
  saved anchor, and Texuli restores it.
-->
<div class="@container flex min-h-0 flex-1 flex-col overflow-hidden">
  {#key conversationId}
    <TexuliMessageList
      messages={chatMessages}
      currentUserId={USER.id}
      label="Conversation messages"
      emptyText="No messages yet. Ask the simulated assistant anything."
      labels={{ editInput: 'Edit your message', saveEdit: 'Save and resend' }}
      onEdit={onEditMessage ? (message, body) => onEditMessage(message.id, body) : undefined}
      anchor={loadReadingAnchor(storageKey)}
      onAnchorChange={(next) => saveReadingAnchor(storageKey, next)}
      class="px-4 py-5 @xl:px-8"
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
