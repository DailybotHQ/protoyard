<script lang="ts">
import { getRuntime, liveQuery, usePrincipal } from '@protoyard/renderer-svelte';
import { Button, Input } from '@protoyard/ui';
import HuddlePanel from './components/HuddlePanel.svelte';
import type { Channel, Message, TeamChatDatabase, Workspace } from './database/schema.ts';
import { createTeamChatServices, SLASH_COMMANDS } from './domain/services.ts';
import { formatTime } from './lib/format.ts';

const runtime = getRuntime<TeamChatDatabase>();
const principal = usePrincipal();
const services = createTeamChatServices(runtime);

let workspaceId = $state<string | null>(null);
let channelId = $state<string | null>(null);
let threadId = $state<string | null>(null);
let draft = $state('');
let searchQ = $state('');
let searchHits = $state<Message[]>([]);
let error = $state<string | null>(null);
let activeHuddleId = $state<string | null>(null);
let newChannelOpen = $state(false);
let newChannelName = $state('');

const workspaces = liveQuery(() => runtime.db.workspaces.toArray(), {
  initial: [] as Workspace[],
  deps: () => [],
});
const channels = liveQuery(
  () => (workspaceId ? services.listChannels(workspaceId) : Promise.resolve([] as Channel[])),
  { initial: [] as Channel[], deps: () => [workspaceId] }
);
const messages = liveQuery(
  () => (channelId ? services.listMessages(channelId, threadId) : Promise.resolve([] as Message[])),
  { initial: [] as Message[], deps: () => [channelId, threadId] }
);
const presence = liveQuery(() => services.listPresence(), {
  initial: [],
  deps: () => [],
});
const bots = services.listBots();

$effect(() => {
  const list = workspaces.current ?? [];
  if (!workspaceId && list[0]) workspaceId = list[0].id;
});

$effect(() => {
  const list = channels.current ?? [];
  if (workspaceId && !channelId && list[0]) channelId = list[0].id;
});

$effect(() => {
  if (channelId) void services.markRead(channelId);
});

async function send() {
  if (!channelId || !draft.trim()) return;
  error = null;
  try {
    const result = await services.sendMessage(channelId, {
      body: draft,
      threadId,
    });
    draft = '';
    if (result.huddle) activeHuddleId = result.huddle.id;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
}

async function createChannel() {
  if (!workspaceId) return;
  error = null;
  try {
    const ch = await services.createChannel(workspaceId, { name: newChannelName });
    newChannelName = '';
    newChannelOpen = false;
    channelId = ch.id;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
}

async function runSearch() {
  if (!workspaceId) return;
  searchHits = await services.search(workspaceId, searchQ);
}

async function react(messageId: string) {
  await services.toggleReaction(messageId, '👍');
}

async function shareDemoFile() {
  if (!channelId) return;
  await services.shareFile(channelId, {
    name: 'notes.example.txt',
    sizeBytes: 1024,
    mimeType: 'text/plain',
  });
}
</script>

<div class="flex h-full min-h-0 bg-background text-foreground">
  <aside class="flex w-60 shrink-0 flex-col border-r border-border bg-muted/30">
    <div class="border-b border-border px-3 py-3">
      <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workspace</p>
      <p class="truncate text-sm font-medium">{(workspaces.current ?? [])[0]?.name ?? 'Loading…'}</p>
      <p class="mt-1 text-[0.65rem] text-muted-foreground">Simulated team chat · no real models</p>
    </div>
    <div class="flex items-center justify-between px-3 py-2">
      <span class="text-xs font-semibold text-muted-foreground">Channels</span>
      <Button size="sm" variant="ghost" onclick={() => (newChannelOpen = !newChannelOpen)}>+ New</Button>
    </div>
    {#if newChannelOpen}
      <div class="flex gap-1 px-2 pb-2">
        <Input bind:value={newChannelName} placeholder="channel-name" class="h-8 text-xs" />
        <Button size="sm" onclick={() => void createChannel()}>Add</Button>
      </div>
    {/if}
    <nav class="min-h-0 flex-1 overflow-y-auto px-1 pb-3" aria-label="Channels">
      {#each channels.current ?? [] as ch (ch.id)}
        <button
          type="button"
          class="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted {channelId ===
          ch.id
            ? 'bg-muted font-medium'
            : ''}"
          onclick={() => {
            channelId = ch.id;
            threadId = null;
          }}
        >
          <span class="text-muted-foreground">{ch.kind === 'dm' ? '·' : '#'}</span>
          <span class="truncate">{ch.name}</span>
        </button>
      {/each}
    </nav>
    <div class="border-t border-border px-3 py-2">
      <p class="text-xs font-semibold text-muted-foreground">Bots</p>
      <ul class="mt-1 space-y-1 text-xs">
        {#each bots as bot}
          <li class="truncate text-muted-foreground">@{bot.handle} — {bot.name}</li>
        {/each}
      </ul>
    </div>
    <div class="border-t border-border px-3 py-2">
      <p class="text-xs font-semibold text-muted-foreground">Presence</p>
      <ul class="mt-1 max-h-28 space-y-0.5 overflow-y-auto text-xs">
        {#each presence.current ?? [] as p}
          <li class="flex justify-between gap-2">
            <span class="truncate">{p.personaId}</span>
            <span class="text-muted-foreground">{p.status}</span>
          </li>
        {/each}
      </ul>
    </div>
  </aside>

  <main class="flex min-w-0 flex-1 flex-col">
    <header class="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-sm font-semibold">
          {(channels.current ?? []).find((c) => c.id === channelId)?.name ?? 'Select a channel'}
        </h1>
        <p class="truncate text-xs text-muted-foreground">
          {(channels.current ?? []).find((c) => c.id === channelId)?.topic ?? ''}
        </p>
      </div>
      <div class="flex gap-1">
        <Input
          class="h-8 w-40 text-xs"
          placeholder="Search…"
          bind:value={searchQ}
          onkeydown={(e) => e.key === 'Enter' && void runSearch()}
        />
        <Button size="sm" variant="outline" onclick={() => void runSearch()}>Search</Button>
        <Button size="sm" variant="outline" onclick={() => void shareDemoFile()}>Share file</Button>
        <Button
          size="sm"
          variant="outline"
          onclick={async () => {
            if (!channelId) return;
            const h = await services.startHuddle(channelId);
            activeHuddleId = h.id;
          }}
        >
          Huddle
        </Button>
      </div>
    </header>

    {#if searchHits.length > 0}
      <div class="border-b border-border bg-muted/40 px-4 py-2 text-xs" role="region" aria-label="Search results">
        <p class="font-medium">{searchHits.length} result(s)</p>
        <ul class="mt-1 max-h-24 space-y-1 overflow-y-auto">
          {#each searchHits as hit}
            <li>
              <button
                type="button"
                class="text-left hover:underline"
                onclick={() => {
                  channelId = hit.channelId;
                  threadId = hit.threadId;
                  searchHits = [];
                }}
              >
                {hit.body.slice(0, 80)}
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if threadId}
      <div class="flex items-center gap-2 border-b border-border bg-muted/20 px-4 py-1 text-xs">
        <span>Thread</span>
        <Button size="sm" variant="ghost" onclick={() => (threadId = null)}>Close</Button>
      </div>
    {/if}

    <div
      class="min-h-0 flex-1 overflow-y-auto px-4 py-3"
      data-py-scroll-root=""
      role="log"
      aria-label="Messages"
    >
      {#if messages.loading}
        <p class="text-sm text-muted-foreground">Loading messages…</p>
      {:else if (messages.current ?? []).length === 0}
        <p class="text-sm text-muted-foreground">No messages yet. Say hello or try /standup.</p>
      {:else}
        {#each messages.current ?? [] as msg (msg.id)}
          <article class="group mb-3 rounded-md px-1 py-1 hover:bg-muted/40">
            <div class="flex items-baseline gap-2 text-xs text-muted-foreground">
              <span class="font-semibold text-foreground">
                {msg.authorKind === 'bot' ? msg.authorId : msg.authorId}
              </span>
              <time datetime={msg.at}>{formatTime(msg.at)}</time>
              {#if msg.authorKind === 'bot'}
                <span class="rounded bg-primary/15 px-1 text-[0.65rem] text-primary">BOT</span>
              {/if}
            </div>
            <p class="whitespace-pre-wrap text-sm">{msg.body}</p>
            {#if msg.fileId}
              <p class="mt-1 text-xs text-muted-foreground">Attachment id {msg.fileId}</p>
            {/if}
            <div class="mt-1 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
              <button type="button" class="text-xs text-muted-foreground hover:text-foreground" onclick={() => void react(msg.id)}>
                👍 React
              </button>
              {#if !msg.threadId}
                <button
                  type="button"
                  class="text-xs text-muted-foreground hover:text-foreground"
                  onclick={() => (threadId = msg.id)}
                >
                  Reply in thread
                </button>
              {/if}
            </div>
          </article>
        {/each}
      {/if}
    </div>

    {#if activeHuddleId}
      <HuddlePanel
        huddleId={activeHuddleId}
        {services}
        onClose={() => {
          void services.endHuddle(activeHuddleId!);
          activeHuddleId = null;
        }}
      />
    {/if}

    <footer class="border-t border-border px-4 py-3">
      {#if error}
        <p class="mb-2 text-xs text-destructive" role="alert">{error}</p>
      {/if}
      <p class="mb-1 text-[0.65rem] text-muted-foreground">
        Slash: {SLASH_COMMANDS.map((c) => c.name).join(' · ')} · Acting as {principal.current?.persona.name ?? '…'}
      </p>
      <form
        class="flex gap-2"
        onsubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Input
          class="flex-1"
          placeholder={threadId ? 'Reply in thread…' : 'Message #channel — try @standup or /ops'}
          bind:value={draft}
          aria-label="Message composer"
        />
        <Button type="submit">Send</Button>
      </form>
    </footer>
  </main>
</div>
