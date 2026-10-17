<script lang="ts">
import { type Snippet, tick } from 'svelte';
import { cn } from '../../lib/cn.ts';
import { formatDay, formatTime, toDate } from '../../lib/date.ts';
import Avatar from '../avatar/Avatar.svelte';
import { groupMessages } from './group-messages.ts';
import type { ChatMessage, ChatMessageStatus } from './types.ts';

interface Props {
  messages: ChatMessage[];
  /** Messages from this author align right as "own" messages. */
  currentUserId?: string;
  /** Custom body renderer (markdown, attachments…); defaults to plain text. */
  body?: Snippet<[ChatMessage]>;
  /** Rendered after the last message inside the scroll area (e.g. a TypingIndicator). */
  footer?: Snippet;
  emptyText?: string;
  locale?: string;
  label?: string;
  class?: string;
}

let {
  messages,
  currentUserId,
  body,
  footer,
  emptyText = 'No messages yet. Say hello!',
  locale,
  label = 'Messages',
  class: className,
}: Props = $props();

let viewport = $state<HTMLDivElement | null>(null);
let stickToBottom = true;
let lastCount = 0;

const groups = $derived(groupMessages(messages));
const statusText: Record<ChatMessageStatus, string> = {
  sending: 'Sending…',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Failed to send',
};

function isNearBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 96;
}

$effect.pre(() => {
  // Measure before the DOM grows so reading older messages is never interrupted.
  void messages.length;
  if (viewport) stickToBottom = isNearBottom(viewport);
});

$effect(() => {
  const count = messages.length;
  const last = messages[count - 1];
  const ownNew = count > lastCount && last !== undefined && last.author.id === currentUserId;
  const first = lastCount === 0;
  lastCount = count;
  if (!viewport || !(stickToBottom || ownNew || first)) return;
  const el = viewport;
  void tick().then(() => {
    el.scrollTop = el.scrollHeight;
  });
});
</script>

<!-- Focusable so keyboard users can scroll the history (scrollable-region-focusable). -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  bind:this={viewport}
  role="log"
  aria-live="polite"
  aria-label={label}
  tabindex="0"
  class={cn('flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset', className)}
>
  {#if messages.length === 0}
    <p class="m-auto text-sm text-muted-foreground">{emptyText}</p>
  {/if}
  {#each groups as group (group.key)}
    {@const own = currentUserId !== undefined && group.authorId === currentUserId}
    {@const head = group.messages[0]}
    {#if group.dayStart}
      <div class="my-3 flex items-center gap-3 text-xs text-muted-foreground" role="separator">
        <span class="h-px flex-1 bg-border"></span>
        <span>{formatDay(group.dayStart, locale)}</span>
        <span class="h-px flex-1 bg-border"></span>
      </div>
    {/if}
    {#if head}
      <div class={cn('mt-3 flex gap-2.5 first:mt-0', own && 'flex-row-reverse')}>
        {#if !own}
          <Avatar name={head.author.name} src={head.author.avatarUrl} size="sm" decorative class="mt-5" />
        {/if}
        <div class={cn('flex max-w-[85%] min-w-0 flex-col gap-1 sm:max-w-[70%]', own ? 'items-end' : 'items-start')}>
          <p class="flex items-baseline gap-2 px-1 text-xs text-muted-foreground">
            {#if !own}<span class="font-medium text-foreground">{head.author.name}</span>{:else}<span class="sr-only">You</span>{/if}
            <time datetime={toDate(head.at).toISOString()}>{formatTime(head.at, locale)}</time>
          </p>
          {#each group.messages as message (message.id)}
            <div
              class={cn(
                'rounded-2xl px-3.5 py-2 text-sm break-words whitespace-pre-wrap',
                own
                  ? 'rounded-br-md bg-primary text-primary-foreground'
                  : 'rounded-bl-md bg-muted text-foreground',
                message.status === 'sending' && 'opacity-70',
                message.status === 'failed' && 'ring-2 ring-destructive'
              )}
            >
              {#if body}{@render body(message)}{:else}{message.body}{/if}
            </div>
            {#if own && message.status && (message.status === 'failed' || message === group.messages[group.messages.length - 1])}
              <p class={cn('px-1 text-[0.7rem]', message.status === 'failed' ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                {statusText[message.status]}
              </p>
            {/if}
          {/each}
        </div>
      </div>
    {/if}
  {/each}
  {@render footer?.()}
</div>
