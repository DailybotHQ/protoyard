<script lang="ts">
import { ArrowDown, CircleAlert, RotateCcw, Square } from '@lucide/svelte';
import { Button } from '@protoyard/ui';
import { tick } from 'svelte';
import { LucideIcon } from 'texuli/icons/lucide';
import type { AgentRun, Message } from '../database/schema.ts';
import { authorOf, type Directory } from '../lib/context.ts';
import { formatLongDay, formatTime } from '../lib/format.ts';
import { plainText } from '../lib/markdown.ts';
import { groupMessages } from '../lib/thread.ts';
import AuthorAvatar from './AuthorAvatar.svelte';
import RichText from './RichText.svelte';

/**
 * The visible window of a thread. Only the newest page of messages is
 * rendered; "Load earlier" grows the window while keeping the reading
 * position. Auto-scroll follows new content only while the reader is at the
 * bottom, so scrolling up to read history is never interrupted.
 */
let {
  conversationId,
  messages,
  earlierCount,
  onLoadEarlier,
  runs,
  isLive,
  meId,
  directory,
  knownHandles,
  canInvoke,
  onRetry,
  onStop,
}: {
  conversationId: string;
  messages: Message[];
  earlierCount: number;
  onLoadEarlier: () => void;
  runs: Map<string, AgentRun>;
  isLive: (runId: string) => boolean;
  meId: string | undefined;
  directory: Directory | undefined;
  knownHandles: string[];
  canInvoke: boolean;
  onRetry: (runId: string) => void;
  onStop: (runId: string) => void;
} = $props();

let viewport = $state<HTMLElement | null>(null);
let stick = true;
let showJump = $state(false);
let anchor: number | null = null;
let lastConversation = '';
let lastSignature = '';
let announcement = $state('');
const seenStatus = new Map<string, Message['status']>();

const groups = $derived(groupMessages(messages));
const signature = $derived.by(() => {
  const last = messages.at(-1);
  return `${messages.length}:${last?.id}:${last?.body.length}:${last?.status}`;
});

function nearBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function scrollToLatest(smooth = false): void {
  const el = viewport;
  if (!el) return;
  el.scrollTo({
    top: el.scrollHeight,
    behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto',
  });
  showJump = false;
}

function loadEarlier(): void {
  if (viewport) anchor = viewport.scrollHeight - viewport.scrollTop;
  onLoadEarlier();
}

$effect.pre(() => {
  // Measure BEFORE the DOM grows: were we following the conversation?
  void signature;
  if (viewport) stick = nearBottom(viewport);
});

$effect(() => {
  const sig = signature;
  const switched = conversationId !== lastConversation;
  const last = messages.at(-1);
  const ownNew = last !== undefined && last.authorId === meId && sig !== lastSignature;
  lastConversation = conversationId;
  const changed = sig !== lastSignature;
  lastSignature = sig;
  const el = viewport;
  if (!el || messages.length === 0) return;
  void tick().then(() => {
    if (anchor !== null) {
      // Prepended older messages: keep the same message under the reader's eyes.
      el.scrollTop = el.scrollHeight - anchor;
      anchor = null;
    } else if (switched || stick || ownNew) {
      el.scrollTop = el.scrollHeight;
      showJump = false;
    } else if (changed) {
      showJump = true;
    }
  });
});

$effect(() => {
  // Announce finished agent replies (not every streamed chunk) to screen readers.
  const switched = !messages.some((m) => seenStatus.has(m.id));
  for (const message of messages) {
    const before = seenStatus.get(message.id);
    seenStatus.set(message.id, message.status);
    if (switched || message.authorKind !== 'agent' || before === undefined) continue;
    if (before === 'streaming' && message.status !== 'streaming') {
      const name = authorOf(directory, message.authorId).name;
      announcement =
        message.status === 'failed'
          ? `${name} could not reply: ${message.body}`
          : `${name} replied: ${plainText(message.body, 200)}`;
    }
  }
});
</script>

<div class="relative flex min-h-0 flex-1 flex-col">
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <section
    bind:this={viewport}
    aria-label="Messages"
    tabindex="0"
    class="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-5"
    onscroll={() => {
      if (viewport && nearBottom(viewport)) showJump = false;
    }}
  >
    {#if earlierCount > 0}
      <div class="mb-3 flex justify-center">
        <Button variant="outline" size="sm" onclick={loadEarlier}>
          Load earlier messages ({earlierCount.toLocaleString('en-US')} more)
        </Button>
      </div>
    {/if}

    <ol class="flex flex-col" aria-label="Message history">
      {#each groups as group (group.key)}
        {@const author = authorOf(directory, group.authorId)}
        {@const own = group.authorId === meId}
        <li class="flex flex-col">
          {#if group.dayStart}
            <div class="my-4 flex items-center gap-3 text-xs text-muted-foreground" role="separator" aria-label={formatLongDay(group.dayStart)}>
              <span class="h-px flex-1 bg-border"></span>
              <span aria-hidden="true">{formatLongDay(group.dayStart)}</span>
              <span class="h-px flex-1 bg-border"></span>
            </div>
          {/if}
          <article
            class={['group/msg mt-3 flex gap-3 rounded-lg px-2 py-1.5', own && 'bg-primary/5']}
            aria-label={`${own ? 'You' : author.name}, ${formatTime(group.messages[0]?.at ?? '')}`}
          >
            <AuthorAvatar {author} />
            <div class="min-w-0 flex-1">
              <p class="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span class="font-semibold text-foreground">{own ? `${author.name} (you)` : author.name}</span>
                {#if author.kind === 'agent'}
                  <span class="rounded px-1.5 text-[0.65rem] font-semibold tracking-wide uppercase" style:color={author.color} style:background-color={`${author.color}22`}>Agent</span>
                {/if}
                <time class="text-xs text-muted-foreground" datetime={group.messages[0]?.at}>{formatTime(group.messages[0]?.at ?? '')}</time>
              </p>
              {#each group.messages as message (message.id)}
                {@const run = message.runId ? runs.get(message.runId) : undefined}
                {@const live = message.runId ? isLive(message.runId) : false}
                <div class="mt-0.5 text-sm leading-relaxed text-foreground" data-message-id={message.id} data-status={message.status}>
                  {#if message.status === 'failed'}
                    <div class="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
                      <LucideIcon icon={CircleAlert} class="size-4 shrink-0 text-destructive" />
                      <span class="flex-1"><span class="font-medium">Reply failed.</span> {message.body}</span>
                      {#if canInvoke && message.runId}
                        <Button size="sm" variant="outline" onclick={() => message.runId && onRetry(message.runId)}>
                          <LucideIcon icon={RotateCcw} /> Retry
                        </Button>
                      {/if}
                    </div>
                  {:else if message.status === 'streaming'}
                    {#if message.body}
                      <RichText text={message.body} {knownHandles} />
                    {/if}
                    {#if live}
                      <div class="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span class="relay-caret" aria-hidden="true"></span>
                        <span>{message.body ? 'Writing…' : 'Thinking…'}</span>
                        {#if canInvoke && message.runId}
                          <Button
                            type="button"
                            variant="ghost"
                            class="inline-flex min-h-touch items-center gap-1 rounded px-1.5 font-medium text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:min-h-0"
                            onclick={() => message.runId && onStop(message.runId)}
                          >
                            <LucideIcon icon={Square} class="size-3 fill-current" /> Stop<span class="sr-only"> {author.name}</span>
                          </Button>
                        {/if}
                      </div>
                    {:else}
                      <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <LucideIcon icon={CircleAlert} class="size-3.5" />
                        <span>Reply interrupted (the page reloaded mid-stream).</span>
                        {#if canInvoke && message.runId}
                          <Button size="sm" variant="ghost" onclick={() => message.runId && onRetry(message.runId)}>
                            <LucideIcon icon={RotateCcw} /> Retry
                          </Button>
                        {/if}
                      </div>
                    {/if}
                  {:else}
                    <RichText text={message.body} {knownHandles} />
                    {#if run?.status === 'cancelled'}
                      <p class="mt-0.5 text-xs text-muted-foreground italic">Stopped</p>
                    {/if}
                  {/if}
                </div>
              {/each}
            </div>
          </article>
        </li>
      {/each}
    </ol>
  </section>

  {#if showJump}
    <Button
      type="button"
      variant="ghost"
      class="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-elevated px-3 py-1.5 text-xs font-medium text-foreground shadow-float hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onclick={() => scrollToLatest(true)}
    >
      <LucideIcon icon={ArrowDown} class="size-3.5" /> New messages
    </Button>
  {/if}

  <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
</div>

<style>
  .relay-caret {
    display: inline-block;
    width: 0.5rem;
    height: 0.9rem;
    border-radius: 1px;
    background: var(--color-primary);
  }
  @media (prefers-reduced-motion: no-preference) {
    .relay-caret {
      animation: relay-blink 1s steps(2, start) infinite;
    }
  }
  @keyframes relay-blink {
    to {
      visibility: hidden;
    }
  }
</style>
