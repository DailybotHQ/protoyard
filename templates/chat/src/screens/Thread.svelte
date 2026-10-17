<script lang="ts">
import { ArrowLeft, Eye, SearchX } from '@lucide/svelte';
import {
  can,
  DEMO_BADGE_ENABLED,
  liveQuery,
  type RouteProps,
  runService,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import { Button, Composer, EmptyState, TypingIndicator } from '@protoyard/ui';
import ConversationMenu from '../components/ConversationMenu.svelte';
import MessageList from '../components/MessageList.svelte';
import { ASSISTANT } from '../domain/assistant.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useChat } from '../lib/context.ts';

let { params }: RouteProps = $props();

const { db, chat, people } = useChat();
const principal = usePrincipal();

const id = $derived(params.id ?? '');
let draft = $state('');

// Dexie runs queriers outside Svelte tracking: the route param goes in `deps`.
const conversation = liveQuery(() => db.conversations.get(id), { deps: () => id });
const messages = liveQuery(
  () => db.messages.where('[conversationId+at]').between([id, ''], [id, '￿']).toArray(),
  { initial: [], deps: () => id }
);

const list = $derived(messages.current ?? []);
const canSend = $derived(can(CAPABILITIES.send));
const streaming = $derived(list.some((m) => m.status === 'streaming' && chat.isLive(m.id)));

// Reading the thread clears its unread badge (once per new or finished message, not per chunk).
const readKey = $derived(`${id}:${list.length}:${list.at(-1)?.status}`);
$effect(() => {
  void readKey;
  if (conversation.current && principal.current) void chat.markRead(id);
});

$effect(() => {
  void id;
  draft = '';
});

async function send(text: string): Promise<boolean> {
  const result = await runService(() => chat.send(id, text), { errorTitle: 'Message not sent' });
  // `false` keeps the draft in the composer (offline, validation…).
  return result.ok;
}
</script>

{#if conversation.loading && !conversation.current}
  <p class="m-auto text-sm text-muted-foreground" role="status">Loading…</p>
{:else if !conversation.current}
  <div class="m-auto">
    <EmptyState icon={SearchX} title="Conversation not found" description="It may have been deleted.">
      {#snippet action()}<Button href="#/" variant="outline">Back to conversations</Button>{/snippet}
    </EmptyState>
  </div>
{:else}
  <div class="flex h-full min-h-0 flex-col">
    <header class="flex items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4">
      <a href="#/" aria-label="Back to conversations" class="grid size-9 min-h-touch min-w-[44px] place-items-center rounded-md hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none @3xl:hidden">
        <ArrowLeft class="size-5" aria-hidden="true" />
      </a>
      <h1 class="min-w-0 flex-1 truncate text-base font-semibold">{conversation.current.title}</h1>
      <ConversationMenu conversation={conversation.current} />
    </header>

    {#if !canSend}
      <div class="flex items-center gap-2 border-b border-border bg-info/10 px-4 py-2 text-sm" role="note">
        <Eye class="size-4 shrink-0" aria-hidden="true" />
        You have read-only access. Ask the owner for a member seat to post.
      </div>
    {/if}

    {#if list.length === 0 && !messages.loading}
      <p class="m-auto px-6 text-center text-sm text-muted-foreground">
        No messages yet.{canSend ? ' Say hello — the assistant replies to every message.' : ''}
      </p>
    {:else}
      <MessageList
        messages={list}
        people={people.current}
        meId={principal.current?.persona.id}
        {canSend}
        isLive={chat.isLive}
        onStop={(messageId) => void chat.cancel(messageId)}
        onRetry={(messageId) => void runService(() => chat.retry(messageId), { errorTitle: 'Could not retry' })}
      />
    {/if}

    <!-- On narrow screens the fixed "Prototype" badge would cover the composer. -->
    <div class={['border-t border-border px-3 pt-1 sm:px-4', DEMO_BADGE_ENABLED ? 'pb-11 @3xl:pb-3' : 'pb-[max(0.75rem,env(safe-area-inset-bottom))]']}>
      <TypingIndicator names={streaming ? [ASSISTANT.name] : []} showLabel class="px-1" />
      <Composer
        bind:value={draft}
        onSubmit={send}
        disabled={!canSend}
        placeholder={canSend ? 'Message the assistant…' : 'Read-only: you cannot post here'}
        maxLength={4000}
      />
    </div>
  </div>
{/if}
