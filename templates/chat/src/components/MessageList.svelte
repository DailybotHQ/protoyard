<script lang="ts">
import { CircleAlert, RotateCcw, Square } from '@lucide/svelte';
import type { Persona } from '@protoyard/core';
import { Button, Separator } from '@protoyard/ui';
import { tick } from 'svelte';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Text } from 'texuli/typography';
import type { Message } from '../database/schema.ts';
import { authorOf } from '../lib/context.ts';
import { formatDay, formatTime } from '../lib/format.ts';
import Avatar from './Avatar.svelte';

/**
 * Messages grouped by consecutive author. It follows new content only while
 * the reader is at the bottom, so scrolling up to read is never interrupted,
 * and announces each FINISHED assistant reply once (not every chunk).
 */
let {
  messages,
  people,
  meId,
  canSend,
  isLive,
  onStop,
  onRetry,
}: {
  messages: Message[];
  people: Map<string, Persona> | undefined;
  meId: string | undefined;
  canSend: boolean;
  isLive: (id: string) => boolean;
  onStop: (id: string) => void;
  onRetry: (id: string) => void;
} = $props();

let viewport = $state<HTMLElement | null>(null);
let stick = true;
let announcement = $state('');
const seen = new Map<string, Message['status']>();

const groups = $derived.by(() => {
  const out: { key: string; authorId: string; items: Message[]; day: string | null }[] = [];
  let previousDay = '';
  for (const message of messages) {
    const day = formatDay(message.at);
    const last = out.at(-1);
    if (last && last.authorId === message.authorId && day === previousDay) last.items.push(message);
    else
      out.push({
        key: message.id,
        authorId: message.authorId,
        items: [message],
        day: day === previousDay ? null : day,
      });
    previousDay = day;
  }
  return out;
});
const signature = $derived(
  `${messages.length}:${messages.at(-1)?.body.length}:${messages.at(-1)?.status}`
);

$effect.pre(() => {
  void signature;
  if (viewport) stick = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 80;
});

$effect(() => {
  void signature;
  const el = viewport;
  const ownNew = messages.at(-1)?.authorId === meId;
  if (el && (stick || ownNew)) void tick().then(() => (el.scrollTop = el.scrollHeight));
});

$effect(() => {
  const fresh = !messages.some((m) => seen.has(m.id));
  for (const m of messages) {
    const before = seen.get(m.id);
    seen.set(m.id, m.status);
    if (
      !fresh &&
      m.authorKind === 'assistant' &&
      before === 'streaming' &&
      m.status !== 'streaming'
    )
      announcement =
        m.status === 'failed'
          ? `The assistant could not reply: ${m.error ?? ''}`
          : `Assistant replied: ${m.body}`;
  }
});
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<section
  bind:this={viewport}
  aria-label="Messages"
  tabindex="0"
  class="relative min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5"
>
  <ol class="flex flex-col gap-3">
    {#each groups as group (group.key)}
      {@const author = authorOf(people, group.authorId)}
      {#if group.day}
        <!-- A list may only contain <li>: the separator role goes on an inner element. -->
        <li>
          <div class="flex items-center gap-3" role="separator" aria-label={group.day}>
            <Separator class="flex-1" /><Text as="span" size="xs" tone="muted" aria-hidden="true">{group.day}</Text><Separator class="flex-1" />
          </div>
        </li>
      {/if}
      <li>
        <Box surface={group.authorId === meId ? 'muted' : 'transparent'} radius="lg" padding="none" class="flex gap-3 px-2 py-1.5">
        <Avatar {author} />
        <div class="min-w-0 flex-1">
          <p class="flex items-baseline gap-2">
            <Text as="span" size="sm" weight="semibold">{author.name}{group.authorId === meId ? ' (you)' : ''}</Text>
            <time datetime={group.items[0]?.at}><Text as="span" size="xs" tone="muted">{formatTime(group.items[0]?.at ?? '')}</Text></time>
          </p>
          {#each group.items as message (message.id)}
            <Text as="div" size="sm" class="mt-0.5 break-words whitespace-pre-wrap" data-message-id={message.id} data-status={message.status}>
              {#if message.status === 'failed'}
                <Box border="default" radius="md" padding="sm" class="flex flex-wrap items-center gap-2 whitespace-normal">
                  <LucideIcon icon={CircleAlert} tone="destructive" class="size-4 shrink-0" />
                  <span class="flex-1"><Text as="span" size="sm" weight="medium" tone="destructive">Reply failed.</Text> {message.error}</span>
                  {#if canSend}<Button size="sm" variant="outline" onclick={() => onRetry(message.id)}><LucideIcon icon={RotateCcw} /> Retry</Button>{/if}
                </Box>
              {:else}
                {message.body}
                {#if message.status === 'streaming'}
                  <Text as="span" size="xs" tone="muted" class="mt-1 flex items-center gap-2 whitespace-normal">
                    {#if isLive(message.id)}
                      {message.body ? 'Writing…' : 'Thinking…'}
                      {#if canSend}
                        <Button type="button" variant="ghost" size="sm" class="min-h-touch gap-1 px-1.5 sm:min-h-0" onclick={() => onStop(message.id)}>
                          <LucideIcon icon={Square} fill="currentColor" class="size-3" /> Stop
                        </Button>
                      {/if}
                    {:else}
                      Reply interrupted by a reload.
                      {#if canSend}<Button size="sm" variant="ghost" onclick={() => onRetry(message.id)}><LucideIcon icon={RotateCcw} /> Retry</Button>{/if}
                    {/if}
                  </Text>
                {:else if message.status === 'stopped'}
                  <Text as="span" size="xs" tone="muted" class="mt-0.5 flex items-center gap-2 whitespace-normal">
                    Stopped
                    {#if canSend}<Button size="sm" variant="ghost" onclick={() => onRetry(message.id)}><LucideIcon icon={RotateCcw} /> Regenerate</Button>{/if}
                  </Text>
                {/if}
              {/if}
            </Text>
          {/each}
        </div>
        </Box>
      </li>
    {/each}
  </ol>
  <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
</section>
