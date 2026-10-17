<script lang="ts">
import { Archive, ArrowLeft, Eye, SearchX } from '@lucide/svelte';
import {
  can,
  DEMO_BADGE_ENABLED,
  liveQuery,
  type RouteProps,
  runService,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import { Button, EmptyState, TypingIndicator } from '@protoyard/ui';
import Dexie from 'dexie';
import { tick } from 'svelte';
import ChatComposer from '../components/ChatComposer.svelte';
import ConversationMenu from '../components/ConversationMenu.svelte';
import MessageThread from '../components/MessageThread.svelte';
import type { Agent, AgentRun, Message } from '../database/schema.ts';
import { CAPABILITIES, ROLE_LABELS } from '../domain/policy.ts';
import { STARTER_PROMPTS } from '../lib/actions.ts';
import { useChat } from '../lib/context.ts';
import { PAGE_SIZE } from '../lib/thread.ts';

let { params }: RouteProps = $props();

const { db, services, directory } = useChat();
const principal = usePrincipal();

const id = $derived(params.id ?? '');
let limit = $state(PAGE_SIZE);
let draft = $state('');
let composer = $state<ReturnType<typeof ChatComposer> | null>(null);
let heading = $state<HTMLElement | null>(null);

const conversation = liveQuery(() => db.conversations.get(id), { deps: () => id });
const members = liveQuery(() => db.participants.where('conversationId').equals(id).toArray(), {
  initial: [],
  deps: () => id,
});
const page = liveQuery(
  async (): Promise<{ messages: Message[]; total: number }> => {
    const [newest, total] = await Promise.all([
      db.messages
        .where('[conversationId+at]')
        .between([id, Dexie.minKey], [id, Dexie.maxKey])
        .reverse()
        .limit(limit)
        .toArray(),
      db.messages.where('conversationId').equals(id).count(),
    ]);
    return { messages: newest.reverse(), total };
  },
  { initial: { messages: [], total: 0 }, deps: () => [id, limit] }
);
const runs = liveQuery(
  async () =>
    new Map((await db.runs.where('conversationId').equals(id).toArray()).map((r) => [r.id, r])),
  { initial: new Map<string, AgentRun>(), deps: () => id }
);

const messages = $derived(page.current?.messages ?? []);
const earlierCount = $derived(Math.max(0, (page.current?.total ?? 0) - messages.length));
const agents = $derived(
  (members.current ?? [])
    .filter((m) => m.memberKind === 'agent')
    .map((m) => directory.current?.agents.get(m.memberId))
    .filter((a): a is Agent => Boolean(a))
);
const people = $derived((members.current ?? []).filter((m) => m.memberKind === 'person'));
const knownHandles = $derived([...(directory.current?.agents.values() ?? [])].map((a) => a.handle));
const streamingRuns = $derived(
  [...(runs.current?.values() ?? [])].filter(
    (r) => r.status === 'streaming' && services.isLive(r.id)
  )
);
const typing = $derived(
  streamingRuns.map((r) => directory.current?.agents.get(r.agentId)?.name ?? 'An agent')
);
const me = $derived(principal.current?.persona.id);
const canSend = $derived(can(CAPABILITIES.send));
const canInvoke = $derived(can(CAPABILITIES.invokeAgents));
const archived = $derived(conversation.current?.archived ?? false);
const disabledReason = $derived(
  !canSend
    ? `${ROLE_LABELS[principal.current?.role ?? ''] ?? 'Your role'} can read this conversation but not post.`
    : archived
      ? 'This conversation is archived. Unarchive it to reply.'
      : ''
);
const replyHint = $derived(
  agents.length === 0
    ? 'No agents here — messages go to teammates only.'
    : agents.length === 1
      ? `${agents[0]?.name} answers every message.`
      : 'Mention an agent to get a reply:'
);

// A new conversation starts with the newest page and focus on its heading.
$effect(() => {
  void id;
  limit = PAGE_SIZE;
  draft = '';
  void tick().then(() => heading?.focus({ preventScroll: true }));
});

// Reading the thread clears its unread badge (once per new or finished message, not per chunk).
const readKey = $derived.by(() => {
  const last = messages.at(-1);
  return `${id}:${messages.length}:${last?.id}:${last?.status}`;
});
$effect(() => {
  void readKey;
  if (id && conversation.current && document.visibilityState === 'visible')
    void services.markRead(id);
});

async function send(text: string): Promise<boolean> {
  const result = await runService(() => services.send(id, text), {
    errorTitle: 'Message not sent',
  });
  if (!result.ok) return false;
  // Agent runs finish on their own; failures render inline with Retry.
  void result.value.runs.catch(() => undefined);
  return true;
}

function retry(runId: string) {
  void runService(() => services.retry(runId), { errorTitle: 'Could not retry' });
}

function stopAll() {
  for (const run of streamingRuns) void services.cancel(run.id);
}

function mention(agent: Agent) {
  void composer?.mentionAgent(agent.handle);
}

async function sendStarter(prompt: string) {
  const text = agents.length > 1 && agents[0] ? `@${agents[0].handle} ${prompt}` : prompt;
  await send(text);
  composer?.focus();
}
</script>

{#if conversation.loading && !conversation.current}
  <div class="flex h-full items-center justify-center text-sm text-muted-foreground" role="status">Loading conversation…</div>
{:else if !conversation.current}
  <div class="flex h-full items-center justify-center">
    <EmptyState icon={SearchX} title="Conversation not found" description="It may have been deleted, or it belongs to a different scenario.">
      {#snippet action()}<Button href="#/" variant="outline">Back to conversations</Button>{/snippet}
    </EmptyState>
  </div>
{:else}
  {@const current = conversation.current}
  <div class="flex h-full min-h-0 flex-col">
    <header class="flex items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4">
      <a
        href="#/"
        class="grid @3xl:hidden size-9 min-h-touch min-w-[44px] place-items-center rounded-md text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label="Back to conversations"
      >
        <ArrowLeft class="size-5" aria-hidden="true" />
      </a>
      <div class="min-w-0 flex-1">
        <h1 bind:this={heading} tabindex="-1" class="truncate text-base font-semibold outline-none">{current.title}</h1>
        <p class="truncate text-xs text-muted-foreground">
          {agents.map((a) => a.name).join(', ') || 'No agents'} · {people.length} {people.length === 1 ? 'person' : 'people'}
          {#if current.pinned}· Pinned{/if}
        </p>
      </div>
      <ConversationMenu conversation={current} />
    </header>

    {#if !canSend}
      <div class="flex items-center gap-2 border-b border-border bg-info/10 px-4 py-2 text-sm" role="note">
        <Eye class="size-4 shrink-0 text-info" aria-hidden="true" />
        <span>You have <span class="font-medium">read-only access</span> as a guest. Ask an admin for a member seat to post or invoke agents.</span>
      </div>
    {:else if archived}
      <div class="flex flex-wrap items-center gap-2 border-b border-border bg-muted px-4 py-2 text-sm" role="note">
        <Archive class="size-4 shrink-0" aria-hidden="true" />
        <span class="flex-1">This conversation is archived.</span>
        {#if can(CAPABILITIES.manageConversation, current)}
          <Button size="sm" variant="outline" onclick={() => runService(() => services.archive(current.id, false), { success: 'Moved back to your inbox' })}>
            Unarchive
          </Button>
        {/if}
      </div>
    {/if}

    {#if messages.length === 0 && !page.loading}
      <div class="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p class="text-sm text-muted-foreground">
          {canSend ? 'No messages yet. Try one of these:' : 'No messages yet.'}
        </p>
        {#if canSend && !archived}
          <ul class="flex max-w-lg flex-wrap justify-center gap-2">
            {#each STARTER_PROMPTS as prompt (prompt)}
              <li>
                <button
                  type="button"
                  class="rounded-full border border-border bg-surface px-3 py-1.5 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onclick={() => sendStarter(prompt)}
                >
                  {prompt}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {:else}
      <MessageThread
        conversationId={id}
        {messages}
        {earlierCount}
        onLoadEarlier={() => (limit += PAGE_SIZE)}
        runs={runs.current ?? new Map()}
        isLive={services.isLive}
        meId={me}
        directory={directory.current}
        {knownHandles}
        {canInvoke}
        onRetry={retry}
        onStop={(runId) => void services.cancel(runId)}
      />
    {/if}

    <!-- On narrow screens the fixed "Prototype" badge would cover the composer. -->
    <div
      class={[
        'border-t border-border px-3 pt-1 sm:px-4',
        DEMO_BADGE_ENABLED
          ? 'pb-11 @3xl:pb-[max(0.75rem,env(safe-area-inset-bottom))]'
          : 'pb-[max(0.75rem,env(safe-area-inset-bottom))]',
      ]}
    >
      <TypingIndicator names={typing} showLabel class="px-1" />
      {#if canSend && !archived}
        <div class="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{replyHint}</span>
          {#if agents.length > 1}
            {#each agents as agent (agent.id)}
              <button
                type="button"
                class="inline-flex min-h-touch items-center gap-1 rounded-full border border-border px-2 py-0.5 font-medium text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:min-h-0"
                onclick={() => mention(agent)}
                aria-label={`Mention ${agent.name}`}
              >
                <span class="size-2 rounded-full" style:background-color={agent.color} aria-hidden="true"></span>@{agent.handle}
              </button>
            {/each}
          {/if}
        </div>
      {/if}
      <ChatComposer
        bind:this={composer}
        bind:value={draft}
        {agents}
        onSend={send}
        onStop={stopAll}
        streaming={streamingRuns.length > 0 && canInvoke}
        disabled={!canSend || archived}
        {disabledReason}
      />
    </div>
  </div>
{/if}
