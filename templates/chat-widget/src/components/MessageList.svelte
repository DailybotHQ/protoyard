<script lang="ts">
import { CircleAlert, RotateCcw, Square } from '@lucide/svelte';
import type { Persona } from '@protoyard/core';
import { Button } from '@protoyard/ui';
import { tick } from 'svelte';
import { LucideIcon } from 'texuli/icons/lucide';
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
  class="relative min-h-0 flex-1 overflow-y-auto px-3 py-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-5"
>
  <ol class="flex flex-col gap-3">
    {#each groups as group (group.key)}
      {@const author = authorOf(people, group.authorId)}
      {#if group.day}
        <!-- A list may only contain <li>: the separator role goes on an inner element. -->
        <li>
          <div class="flex items-center gap-3 text-xs text-muted-foreground" role="separator" aria-label={group.day}>
            <span class="h-px flex-1 bg-border"></span><span aria-hidden="true">{group.day}</span><span class="h-px flex-1 bg-border"></span>
          </div>
        </li>
      {/if}
      <li class={['flex gap-3 rounded-lg px-2 py-1.5', group.authorId === meId && 'bg-primary/5']}>
        <Avatar {author} />
        <div class="min-w-0 flex-1">
          <p class="flex items-baseline gap-2 text-sm">
            <span class="font-semibold">{author.name}{group.authorId === meId ? ' (you)' : ''}</span>
            <time class="text-xs text-muted-foreground" datetime={group.items[0]?.at}>{formatTime(group.items[0]?.at ?? '')}</time>
          </p>
          {#each group.items as message (message.id)}
            <div class="mt-0.5 text-sm leading-relaxed break-words whitespace-pre-wrap" data-message-id={message.id} data-status={message.status}>
              {#if message.status === 'failed'}
                <div class="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 whitespace-normal">
                  <LucideIcon icon={CircleAlert} class="size-4 shrink-0 text-destructive" />
                  <span class="flex-1"><span class="font-medium">Reply failed.</span> {message.error}</span>
                  {#if canSend}<Button size="sm" variant="outline" onclick={() => onRetry(message.id)}><LucideIcon icon={RotateCcw} /> Retry</Button>{/if}
                </div>
              {:else}
                {message.body}
                {#if message.status === 'streaming'}
                  <span class="mt-1 flex items-center gap-2 text-xs whitespace-normal text-muted-foreground">
                    {#if isLive(message.id)}
                      {message.body ? 'Writing…' : 'Thinking…'}
                      {#if canSend}
                        <Button type="button" class="inline-flex min-h-touch items-center gap-1 rounded px-1.5 font-medium text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:min-h-0" onclick={() => onStop(message.id)}>
                          <LucideIcon icon={Square} class="size-3 fill-current" /> Stop
                        </Button>
                      {/if}
                    {:else}
                      Reply interrupted by a reload.
                      {#if canSend}<Button size="sm" variant="ghost" onclick={() => onRetry(message.id)}><LucideIcon icon={RotateCcw} /> Retry</Button>{/if}
                    {/if}
                  </span>
                {:else if message.status === 'stopped'}
                  <span class="mt-0.5 flex items-center gap-2 text-xs whitespace-normal text-muted-foreground italic">
                    Stopped
                    {#if canSend}<Button size="sm" variant="ghost" onclick={() => onRetry(message.id)}><LucideIcon icon={RotateCcw} /> Regenerate</Button>{/if}
                  </span>
                {/if}
              {/if}
            </div>
          {/each}
        </div>
      </li>
    {/each}
  </ol>
  <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
</section>
