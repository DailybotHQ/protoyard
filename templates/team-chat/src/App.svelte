<script lang="ts">
import { ChevronLeft, Ellipsis } from '@lucide/svelte';
import type { Persona } from '@protoyard/core';
import { avatarImage, getRuntime, liveQuery, usePrincipal } from '@protoyard/renderer-svelte';
import { Avatar, Badge, Button, Input, Separator } from '@protoyard/ui';
import { tick } from 'svelte';
import { Chip } from 'texuli/badge';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Heading, Text } from 'texuli/typography';
import HuddlePanel from './components/HuddlePanel.svelte';
import type { Channel, Message, TeamChatDatabase, Workspace } from './database/schema.ts';
import {
  CAPABILITIES,
  createTeamChatServices,
  type ReactionSummary,
  SLASH_COMMANDS,
} from './domain/services.ts';
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
let toast = $state<string | null>(null);
let activeHuddleId = $state<string | null>(null);
let newChannelOpen = $state(false);
let newChannelName = $state('');
let memberOfChannel = $state(false);
// Below `md` the channel list and the channel are separate screens; wider, both show.
let mobilePane = $state<'channels' | 'channel'>('channel');
// Below `sm` search, file sharing and huddles live in a row the "More actions" button
// discloses (a native disclosure: a menu library would add ~30 KB to this eager screen).
let toolsOpen = $state(false);
let toolsTrigger = $state<HTMLElement | null>(null);
let toolsPanel = $state<HTMLElement | null>(null);
let channelHeading = $state<HTMLHeadingElement | null>(null);
let channelNav = $state<HTMLElement>();

const canPost = $derived(services.can(CAPABILITIES['message:create']));
const canReact = $derived(services.can(CAPABILITIES['message:react']));
const canShare = $derived(services.can(CAPABILITIES['file:share']));
const canHuddle = $derived(services.can(CAPABILITIES['huddle:start']));
const canCreateChannel = $derived(services.can(CAPABILITIES['channel:create']));
const readOnlyReason = 'Read-only role: this action needs a member or owner persona';

const workspaces = liveQuery(() => runtime.db.workspaces.toArray(), {
  initial: [] as Workspace[],
  deps: () => [],
});
const channels = liveQuery(
  () => (workspaceId ? services.listChannels(workspaceId) : Promise.resolve([] as Channel[])),
  { initial: [] as Channel[], deps: () => [workspaceId, principal.current?.persona.id] }
);
const messages = liveQuery(
  () => (channelId ? services.listMessages(channelId, threadId) : Promise.resolve([] as Message[])),
  { initial: [] as Message[], deps: () => [channelId, threadId, principal.current?.persona.id] }
);
const reactions = liveQuery(
  () =>
    channelId
      ? services.listReactionSummaries(channelId)
      : Promise.resolve([] as ReactionSummary[]),
  { initial: [] as ReactionSummary[], deps: () => [channelId, principal.current?.persona.id] }
);
const presence = liveQuery(() => services.listPresence(), {
  initial: [],
  deps: () => [],
});
const bots = services.listBots();
/** Workspace people by id, for names and faces on messages and presence. */
const people = liveQuery(
  async () =>
    new Map(((await runtime.db.table('py_personas').toArray()) as Persona[]).map((p) => [p.id, p])),
  { initial: new Map<string, Persona>(), deps: () => [] }
);
const personOf = (id: string) => people.current?.get(id);

const reactionsByMessage = $derived.by(() => {
  const map = new Map<string, ReactionSummary[]>();
  for (const row of reactions.current ?? []) {
    const list = map.get(row.messageId) ?? [];
    list.push(row);
    map.set(row.messageId, list);
  }
  return map;
});

$effect(() => {
  const list = workspaces.current ?? [];
  if (!workspaceId && list[0]) workspaceId = list[0].id;
});

$effect(() => {
  const list = channels.current ?? [];
  if (workspaceId && !channelId && list[0]) channelId = list[0].id;
});

$effect(() => {
  const personaId = principal.current?.persona.id;
  if (!channelId) {
    memberOfChannel = false;
    return;
  }
  void personaId;
  void services.isMember(channelId).then((ok) => {
    memberOfChannel = ok;
  });
  void services.markRead(channelId).catch((e) => {
    // Viewer can mark read; membership denial on private is the only expected fail.
    if (e instanceof Error) toast = e.message;
  });
});

function showDenied(action: string) {
  toast = `${action}: ${readOnlyReason}`;
  window.setTimeout(() => {
    if (toast?.includes(readOnlyReason)) toast = null;
  }, 4_000);
}

async function send() {
  if (!channelId || !draft.trim()) return;
  const trimmed = draft.trim();
  // /search <query> runs workspace search without posting a literal message.
  const searchMatch = /^\/search(?:\s+(.*))?$/i.exec(trimmed);
  if (searchMatch) {
    const q = (searchMatch[1] ?? '').trim();
    if (!workspaceId) return;
    error = null;
    if (q.length < 2) {
      error = 'Search needs at least 2 characters after /search.';
      return;
    }
    try {
      searchQ = q;
      searchHits = await services.search(workspaceId, q);
      draft = '';
      if (searchHits.length === 0) toast = 'No search results.';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    return;
  }
  if (!canPost) {
    showDenied('Send');
    return;
  }
  error = null;
  try {
    const result = await services.sendMessage(channelId, {
      body: draft,
      threadId,
    });
    draft = '';
    if (result.huddle) activeHuddleId = result.huddle.id;
    memberOfChannel = true;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
}

async function joinCurrent() {
  if (!channelId) return;
  if (!canPost) {
    showDenied('Join');
    return;
  }
  error = null;
  try {
    await services.joinChannel(channelId);
    memberOfChannel = true;
    toast = 'Joined channel';
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
}

async function createChannel() {
  if (!workspaceId) return;
  if (!canCreateChannel) {
    showDenied('Create channel');
    return;
  }
  error = null;
  try {
    const ch = await services.createChannel(workspaceId, { name: newChannelName });
    newChannelName = '';
    newChannelOpen = false;
    channelId = ch.id;
    memberOfChannel = true;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
}

async function runSearch() {
  if (!workspaceId) return;
  error = null;
  try {
    searchHits = await services.search(workspaceId, searchQ);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
}

async function react(messageId: string, emoji = '👍') {
  if (!canReact) {
    showDenied('React');
    return;
  }
  error = null;
  try {
    await services.toggleReaction(messageId, emoji);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
}

async function replyInThread(messageId: string) {
  threadId = messageId;
}

/** Closing a thread returns focus to the "Reply in thread" button that opened it. */
let focusThreadTrigger = $state<string | null>(null);

function closeThread() {
  focusThreadTrigger = threadId;
  threadId = null;
}

// The channel's messages reload after a thread closes; focus the trigger once it renders.
$effect(() => {
  void messages.current;
  if (!focusThreadTrigger || threadId) return;
  const trigger = document.querySelector<HTMLButtonElement>(
    `[data-message-id="${CSS.escape(focusThreadTrigger)}"] [data-thread-trigger]`
  );
  if (!trigger) return;
  trigger.focus();
  focusThreadTrigger = null;
});

async function openChannel(id: string) {
  channelId = id;
  threadId = null;
  if (mobilePane === 'channel') return;
  mobilePane = 'channel';
  await tick();
  channelHeading?.focus();
}

async function showChannelList() {
  mobilePane = 'channels';
  await tick();
  (
    channelNav?.querySelector<HTMLButtonElement>('[aria-current="page"]') ??
    channelNav?.querySelector<HTMLButtonElement>('button')
  )?.focus();
}

async function shareDemoFile() {
  if (!channelId) return;
  if (!canShare) {
    showDenied('Share file');
    return;
  }
  error = null;
  try {
    await services.shareFile(channelId, {
      name: 'notes.example.txt',
      sizeBytes: 1024,
      mimeType: 'text/plain',
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
}

async function startHuddle() {
  if (!channelId) return;
  if (!canHuddle) {
    showDenied('Huddle');
    return;
  }
  error = null;
  try {
    const h = await services.startHuddle(channelId);
    activeHuddleId = h.id;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
}

const activeChannel = $derived((channels.current ?? []).find((c) => c.id === channelId) ?? null);
const needsJoin = $derived(
  Boolean(activeChannel && activeChannel.kind === 'public' && !memberOfChannel && canPost)
);

function closeToolsOnEscape(event: KeyboardEvent) {
  if (!toolsOpen || event.key !== 'Escape') return;
  const focused = document.activeElement;
  if (focused !== toolsTrigger && !toolsPanel?.contains(focused)) return;
  toolsOpen = false;
  toolsTrigger?.focus();
}
</script>

<svelte:window onkeydown={closeToolsOnEscape} />

<!-- `data-py-scroll-root` is reserved for the renderer's own wrapper: the message log
     uses `data-message-log`, or the renderer's layout rules would flatten it. -->
<div class="flex h-app max-h-app min-h-0 overflow-hidden">
  <Box
    as="aside"
    surface="subtle"
    radius="none"
    padding="none"
    class="{mobilePane === 'channels'
      ? 'flex w-full'
      : 'hidden'} min-h-0 shrink-0 flex-col md:flex md:w-60"
  >
    <Box border="block-end" radius="none" padding="none" class="px-3 py-3">
      <Text size="xs" tone="muted" weight="semibold" transform="uppercase" tracking="wide">Workspace</Text>
      <Text size="sm" weight="medium" truncate>{(workspaces.current ?? [])[0]?.name ?? 'Loading…'}</Text>
      <Text size="xs" tone="muted" class="mt-1">
        Team chat · simulated bots · no real models
      </Text>
    </Box>
    <div class="flex items-center justify-between px-3 py-2">
      <Text as="span" size="xs" tone="muted" weight="semibold">Channels</Text>
      <Button
        size="sm"
        variant="ghost"
        disabled={!canCreateChannel}
        title={canCreateChannel ? 'New channel' : readOnlyReason}
        onclick={() => {
          if (!canCreateChannel) {
            showDenied('New channel');
            return;
          }
          newChannelOpen = !newChannelOpen;
        }}>+ New</Button
      >
    </div>
    {#if newChannelOpen}
      <div class="flex gap-1 px-2 pb-2">
        <Input bind:value={newChannelName} placeholder="channel-name" class="h-8" />
        <Button size="sm" onclick={() => createChannel()}>Add</Button>
      </div>
    {/if}
    <nav
      bind:this={channelNav}
      class="min-h-0 flex-1 overflow-y-auto px-1 pb-3"
      aria-label="Channels"
    >
      {#each channels.current ?? [] as ch (ch.id)}
        <Button
          type="button"
          variant={channelId === ch.id ? 'secondary' : 'ghost'}
          size="sm"
          class="min-h-touch w-full justify-start gap-1 whitespace-normal px-2 py-1.5 text-left md:min-h-0"
          aria-current={channelId === ch.id ? 'page' : undefined}
          onclick={() => openChannel(ch.id)}
        >
          <Text as="span" size="sm" tone="muted">{ch.kind === 'dm' ? '·' : '#'}</Text>
          <span class="truncate">{ch.name}</span>
        </Button>
      {/each}
    </nav>
    <Box border="block-start" radius="none" padding="none" class="px-3 py-2">
      <Text size="xs" tone="muted" weight="semibold">Bots</Text>
      <ul class="mt-1 space-y-1">
        {#each bots as bot}
          <li><Text size="xs" tone="muted" truncate>@{bot.handle} — {bot.name}</Text></li>
        {/each}
      </ul>
    </Box>
    <Box border="block-start" radius="none" padding="none" class="px-3 py-2">
      <Text size="xs" tone="muted" weight="semibold">Presence</Text>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <ul
        class="mt-1 max-h-28 space-y-0.5 overflow-y-auto"
        tabindex="0"
        aria-label="Presence"
      >
        {#each presence.current ?? [] as p}
          {@const who = personOf(p.personaId)}
          <li class="flex items-center justify-between gap-2">
            <span class="flex min-w-0 items-center gap-1.5">
              <Avatar name={who?.name ?? p.personaId} {...avatarImage(who?.avatar)} size="xs" decorative />
              <Text as="span" size="xs" truncate>{who?.name ?? p.personaId}</Text>
            </span>
            <Text as="span" size="xs" tone="muted">{p.status}</Text>
          </li>
        {/each}
      </ul>
    </Box>
  </Box>
  <Separator orientation="vertical" class="hidden md:block" />

  <main class="{mobilePane === 'channel' ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col md:flex">
    <Box as="header" border="block-end" radius="none" padding="none" class="flex items-center gap-2 px-2 py-2 sm:flex-wrap sm:px-4">
      <Button
        size="icon"
        variant="ghost"
        class="shrink-0 md:hidden"
        aria-label="Back to channels"
        onclick={() => showChannelList()}
      >
        <LucideIcon icon={ChevronLeft} class="size-5" />
      </Button>
      <div class="min-w-0 flex-1">
        <Heading bind:ref={channelHeading} tabindex={-1} level={1} size="sm" truncate>
          {activeChannel?.name ?? 'Select a channel'}
        </Heading>
        <Text size="xs" tone="muted" truncate>
          {activeChannel?.topic ?? ''}
        </Text>
      </div>
      <div class="flex shrink-0 gap-1 sm:flex-wrap">
        <div class="hidden gap-1 sm:flex">
          <Input
            class="h-8 w-40"
            placeholder="Search…"
            aria-label="Search messages"
            bind:value={searchQ}
            onkeydown={(e) => e.key === 'Enter' && void runSearch()}
          />
          <Button size="sm" variant="outline" onclick={() => runSearch()}>Search</Button>
        </div>
        {#if needsJoin}
          <Button size="sm" variant="default" onclick={() => joinCurrent()}>Join</Button>
        {/if}
        <div class="hidden gap-1 sm:flex">
          <Button
            size="sm"
            variant="outline"
            disabled={!canShare}
            title={canShare ? 'Share a demo file' : readOnlyReason}
            onclick={() => shareDemoFile()}>Share file</Button
          >
          <Button
            size="sm"
            variant="outline"
            aria-label="Start huddle"
            disabled={!canHuddle}
            title={canHuddle ? 'Start huddle' : readOnlyReason}
            onclick={() => startHuddle()}
          >
            Huddle
          </Button>
        </div>
        <Button
          bind:ref={toolsTrigger}
          type="button"
          variant="ghost"
          size="icon"
          class="min-h-touch min-w-11 sm:hidden"
          aria-label="More actions"
          aria-expanded={toolsOpen}
          aria-controls="team-chat-phone-tools"
          onclick={() => (toolsOpen = !toolsOpen)}
        >
          <LucideIcon icon={Ellipsis} class="size-5" />
        </Button>
      </div>
    </Box>

    {#if toolsOpen}
      <Box
        bind:ref={toolsPanel}
        id="team-chat-phone-tools"
        border="block-end"
        radius="none"
        padding="none"
        class="space-y-2 px-2 py-2 sm:hidden"
        role="group"
        aria-label="More actions"
      >
        <form
          class="flex gap-2"
          role="search"
          onsubmit={(e) => {
            e.preventDefault();
            void runSearch();
          }}
        >
          <Input
            class="h-9 flex-1"
            placeholder="Search messages…"
            aria-label="Search messages"
            bind:value={searchQ}
          />
          <Button type="submit" size="sm" variant="outline">Search</Button>
        </form>
        <div class="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            class="flex-1"
            disabled={!canShare}
            title={canShare ? 'Share a demo file' : readOnlyReason}
            onclick={() => shareDemoFile()}>Share file</Button
          >
          <Button
            size="sm"
            variant="outline"
            class="flex-1"
            aria-label="Start huddle"
            disabled={!canHuddle}
            title={canHuddle ? 'Start huddle' : readOnlyReason}
            onclick={async () => {
              await startHuddle();
              toolsOpen = false;
            }}>Huddle</Button
          >
        </div>
      </Box>
    {/if}

    {#if toast}
      <Box
        surface="muted"
        border="block-end"
        radius="none"
        padding="none"
        class="px-4 py-2"
        role="status"
        aria-live="polite"
      >
        <Text size="xs">{toast}</Text>
      </Box>
    {/if}

    {#if searchHits.length > 0}
      <Box
        surface="subtle"
        border="block-end"
        radius="none"
        padding="none"
        class="px-4 py-2"
        role="region"
        aria-label="Search results"
      >
        <Text size="xs" weight="medium">{searchHits.length} result(s)</Text>
        <ul class="mt-1 max-h-24 space-y-1 overflow-y-auto">
          {#each searchHits as hit}
            <li>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                class="w-full justify-start whitespace-normal text-left"
                onclick={() => {
                  channelId = hit.channelId;
                  threadId = hit.threadId;
                  searchHits = [];
                }}
              >
                {hit.body.slice(0, 80)}
              </Button>
            </li>
          {/each}
        </ul>
      </Box>
    {/if}

    {#if threadId}
      <Box
        surface="subtle"
        border="block-end"
        radius="none"
        padding="none"
        class="flex items-center gap-2 px-4 py-1"
        data-py-thread=""
        role="status"
        aria-label="Thread open"
      >
        <Text as="span" size="xs">Thread</Text>
        <Button size="sm" variant="ghost" aria-label="Close thread" onclick={() => closeThread()}>
          Close
        </Button>
      </Box>
    {/if}

    <div
      class="min-h-0 flex-1 overflow-y-auto px-4 py-3"
      data-message-log=""
      role="log"
      aria-label="Messages"
    >
      {#if messages.loading}
        <Text size="sm" tone="muted">Loading messages…</Text>
      {:else if (messages.current ?? []).length === 0}
        <Text size="sm" tone="muted">
          No messages yet. Try @standup, /ops, or /huddle.
        </Text>
      {:else}
        {#each messages.current ?? [] as msg (msg.id)}
          <article
            class="mb-3 px-1 py-1"
            data-message-id={msg.id}
            data-author-kind={msg.authorKind}
            data-author-id={msg.authorId}
          >
            <div class="flex items-center gap-2">
              {#if msg.authorKind === 'bot'}
                <Text as="span" size="xs" weight="semibold">
                  {bots.find((b) => b.id === msg.authorId)?.name ?? msg.authorId}
                </Text>
              {:else}
                {@const author = personOf(msg.authorId)}
                <Avatar name={author?.name ?? msg.authorId} {...avatarImage(author?.avatar)} size="xs" decorative />
                <Text as="span" size="xs" weight="semibold">{author?.name ?? msg.authorId}</Text>
              {/if}
              <time datetime={msg.at}><Text as="span" size="xs" tone="muted">{formatTime(msg.at)}</Text></time>
              {#if msg.authorKind === 'bot'}
                <Badge variant="outline">AI · simulated</Badge>
              {/if}
            </div>
            <Text size="sm" class="whitespace-pre-wrap" data-message-body="">{msg.body}</Text>
            {#if msg.fileId}
              <Text size="xs" tone="muted" class="mt-1">Attachment id {msg.fileId}</Text>
            {/if}
            {#if (reactionsByMessage.get(msg.id) ?? []).length > 0}
              <div class="mt-1 flex flex-wrap gap-1" data-reactions="" aria-label="Reactions">
                {#each reactionsByMessage.get(msg.id) ?? [] as chip (chip.emoji)}
                  <Chip
                    label={`${chip.emoji} ${chip.count}`}
                    selected={chip.mine}
                    disabled={!canReact}
                    title={canReact ? `Toggle ${chip.emoji}` : readOnlyReason}
                    aria-label={`${chip.emoji} ${chip.count}${chip.mine ? ', you reacted' : ''}`}
                    onclick={() => react(msg.id, chip.emoji)}
                  />
                {/each}
              </div>
            {/if}
            <div class="mt-1 flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="React with thumbs up"
                disabled={!canReact}
                title={canReact ? 'React with thumbs up' : readOnlyReason}
                onclick={() => react(msg.id)}
              >
                👍 React
              </Button>
              {#if !msg.threadId}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Reply in thread"
                  data-thread-trigger=""
                  onclick={() => replyInThread(msg.id)}
                >
                  Reply in thread
                </Button>
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

    <Box as="footer" border="block-start" radius="none" padding="none" class="px-4 py-3">
      {#if error}
        <Text size="xs" tone="destructive" class="mb-2" role="alert">{error}</Text>
      {/if}
      {#if needsJoin}
        <Text size="xs" tone="muted" class="mb-2" role="status">
          You can read this public channel. Join to post, react, share files or start a huddle.
        </Text>
      {:else if !canPost}
        <Text size="xs" tone="muted" class="mb-2" role="status">
          Viewing as {principal.current?.role ?? 'guest'} — posting is disabled ({readOnlyReason}).
        </Text>
      {/if}
      <Text size="xs" tone="muted" class="mb-1">
        Slash: {SLASH_COMMANDS.map((c) => c.name).join(' · ')} · Acting as {principal.current
          ?.persona.name ?? '…'}
      </Text>
      <form
        class="flex gap-2"
        onsubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Input
          class="flex-1"
          placeholder={threadId
            ? 'Reply in thread…'
            : 'Message #channel — try @standup, /ops or /huddle'}
          bind:value={draft}
          aria-label="Message composer"
          data-py-composer=""
          disabled={!canPost || (Boolean(activeChannel) && !memberOfChannel)}
          title={canPost
            ? memberOfChannel || !activeChannel
              ? undefined
              : 'Join this channel before posting'
            : readOnlyReason}
        />
        <Button
          type="submit"
          aria-label="Send message"
          disabled={!canPost || (Boolean(activeChannel) && !memberOfChannel)}
          title={canPost
            ? memberOfChannel || !activeChannel
              ? 'Send'
              : 'Join this channel before posting'
            : readOnlyReason}>Send</Button
        >
      </form>
    </Box>
  </main>
</div>
