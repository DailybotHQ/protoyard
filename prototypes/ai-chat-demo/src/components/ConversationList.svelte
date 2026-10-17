<script lang="ts">
import { Archive, Inbox, MessagesSquare, Pin, Plus, Search, Sparkles } from '@lucide/svelte';
import {
  can,
  DEMO_BADGE_ENABLED,
  type HashRouter,
  Link,
  liveQuery,
  useClock,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import { Button, EmptyState, Input } from '@protoyard/ui';
import type { Message } from '../database/schema.ts';
import { CAPABILITIES, ROLE_LABELS } from '../domain/policy.ts';
import { startWithAgent } from '../lib/actions.ts';
import { authorOf, useChat } from '../lib/context.ts';
import { shortStamp } from '../lib/format.ts';
import { plainText } from '../lib/markdown.ts';
import AuthorAvatar from './AuthorAvatar.svelte';

let { router, onNew }: { router: HashRouter; onNew: () => void } = $props();

const { services, inbox, directory } = useChat();
const principal = usePrincipal();
const clock = useClock();

let query = $state('');
let showArchived = $state(false);
let starting = $state(false);

const all = $derived(inbox.current ?? []);
const archivedCount = $derived(all.filter((c) => c.archived).length);
const visible = $derived(all.filter((c) => c.archived === showArchived));
const unreadTotal = $derived(all.filter((c) => !c.archived).reduce((n, c) => n + c.unread, 0));
const titles = $derived(new Map(all.map((c) => [c.id, c.title])));
const searching = $derived(query.trim().length >= 2);
const me = $derived(principal.current);
const meAuthor = $derived(me ? authorOf(directory.current, me.persona.id) : null);

const results = liveQuery(
  async (): Promise<Message[]> => (query.trim().length >= 2 ? services.search(query, 60) : []),
  { initial: [], deps: () => query }
);
// Search runs over every message; only show conversations this persona belongs to.
const hits = $derived(
  (results.current ?? []).filter((m) => titles.has(m.conversationId)).slice(0, 30)
);

function snippet(body: string): { before: string; match: string; after: string } {
  const text = plainText(body, 400);
  const q = query.trim().toLowerCase();
  const index = text.toLowerCase().indexOf(q);
  if (index < 0) return { before: plainText(text, 90), match: '', after: '' };
  const start = Math.max(0, index - 30);
  return {
    before: (start > 0 ? '…' : '') + text.slice(start, index),
    match: text.slice(index, index + q.length),
    after: plainText(text.slice(index + q.length), 60),
  };
}

async function askAtlas() {
  const atlas = directory.current?.agents.get('agent_atlas');
  if (!atlas) return;
  starting = true;
  await startWithAgent(services, atlas);
  starting = false;
}
</script>

<div class="flex h-full min-h-0 flex-col">
  <div class="flex items-center gap-2.5 px-4 pt-4 pb-3">
    <a href="#/" class="flex min-w-0 flex-1 items-center gap-2.5 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm" aria-hidden="true">
        <MessagesSquare class="size-4" />
      </span>
      <span class="min-w-0 leading-tight">
        <span class="block text-sm font-semibold text-foreground">Relay</span>
        <span class="block truncate text-xs text-muted-foreground">{me?.organization?.name ?? 'Team AI chat'}</span>
      </span>
    </a>
    {#if can(CAPABILITIES.createConversation)}
      <Button size="sm" onclick={onNew}>
        <Plus aria-hidden="true" /> New<span class="sr-only"> conversation</span>
      </Button>
    {/if}
  </div>

  <div class="px-4 pb-3">
    <div class="relative">
      <Search class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input type="search" bind:value={query} placeholder="Search messages…" aria-label="Search messages" class="pl-8" />
    </div>
  </div>

  {#if searching}
    <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
      <p class="px-2 pb-2 text-xs text-muted-foreground" role="status">
        {hits.length === 0 ? 'No messages match' : `${hits.length}${hits.length === 30 ? '+' : ''} matching messages`}
      </p>
      <ul class="flex flex-col gap-0.5">
        {#each hits as hit (hit.id)}
          {@const part = snippet(hit.body)}
          <li>
            <a
              href={router.href('/c/:id', { id: hit.conversationId })}
              class="block rounded-md px-2 py-2 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span class="flex items-baseline justify-between gap-2">
                <span class="truncate font-medium text-foreground">{titles.get(hit.conversationId)}</span>
                <span class="shrink-0 text-xs text-muted-foreground">{shortStamp(hit.at, clock.now)}</span>
              </span>
              <span class="mt-0.5 block text-xs text-muted-foreground">
                <span class="font-medium text-foreground/80">{authorOf(directory.current, hit.authorId).name}:</span>
                {part.before}<mark class="rounded bg-primary/25 px-0.5 text-foreground">{part.match}</mark>{part.after}
              </span>
            </a>
          </li>
        {/each}
      </ul>
    </div>
  {:else}
    <div class="flex gap-1 px-4 pb-2" role="group" aria-label="Which conversations to show">
      <button
        type="button"
        aria-pressed={!showArchived}
        class={[
          'inline-flex min-h-touch items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:min-h-0',
          !showArchived ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted',
        ]}
        onclick={() => (showArchived = false)}
      >
        <Inbox class="size-3.5" aria-hidden="true" /> Inbox
        {#if unreadTotal > 0}<span class="sr-only">({unreadTotal} unread)</span>{/if}
      </button>
      <button
        type="button"
        aria-pressed={showArchived}
        class={[
          'inline-flex min-h-touch items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:min-h-0',
          showArchived ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted',
        ]}
        onclick={() => (showArchived = true)}
      >
        <Archive class="size-3.5" aria-hidden="true" /> Archived ({archivedCount})
      </button>
    </div>

    <nav class="min-h-0 flex-1 overflow-y-auto px-2 pb-4" aria-label={showArchived ? 'Archived conversations' : 'Conversations'}>
      {#if inbox.loading && all.length === 0}
        <p class="px-2 py-6 text-center text-sm text-muted-foreground">Loading conversations…</p>
      {:else if visible.length === 0}
        {#if showArchived}
          <EmptyState size="sm" icon={Archive} title="Nothing archived" description="Archived conversations stay searchable and can be restored anytime." />
        {:else if all.length === 0}
          <EmptyState size="sm" icon={Sparkles} title="No conversations yet" description="Start one with an agent — Atlas can summarize, compare and research.">
            {#snippet action()}
              {#if can(CAPABILITIES.createConversation)}
                <!-- Desktop shows the larger welcome pane instead. -->
                <span class="@3xl:hidden">
                  <Button size="sm" onclick={askAtlas} loading={starting}><Sparkles aria-hidden="true" /> Ask Atlas</Button>
                </span>
              {/if}
            {/snippet}
          </EmptyState>
        {:else}
          <EmptyState size="sm" icon={Inbox} title="Inbox zero" description="Every conversation is archived." />
        {/if}
      {:else}
        <ul class="flex flex-col gap-0.5">
          {#each visible as item (item.id)}
            {@const preview = item.previewAuthorId ? authorOf(directory.current, item.previewAuthorId) : null}
            <li>
              <Link
                href={`/c/${item.id}`}
                {router}
                class="group flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                activeClass="bg-primary/10 hover:bg-primary/15"
              >
                <span class="mt-0.5 flex -space-x-2" aria-hidden="true">
                  {#each item.agentIds.slice(0, 2) as agentId (agentId)}
                    <AuthorAvatar author={authorOf(directory.current, agentId)} size="sm" />
                  {:else}
                    <span class="grid size-7 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">#</span>
                  {/each}
                </span>
                <span class="min-w-0 flex-1">
                  <span class="flex items-baseline gap-2">
                    <span class={['flex-1 truncate text-sm', item.unread > 0 ? 'font-semibold text-foreground' : 'font-medium text-foreground/90']}>
                      {item.title}
                    </span>
                    {#if item.pinned}<Pin class="size-3 shrink-0 text-muted-foreground" aria-label="Pinned" />{/if}
                    <span class="shrink-0 text-[0.7rem] text-muted-foreground">{shortStamp(item.lastMessageAt, clock.now)}</span>
                  </span>
                  <span class="mt-0.5 flex items-center gap-2">
                    <span class="flex-1 truncate text-xs text-muted-foreground">
                      {#if preview}{preview.id === me?.persona.id ? 'You' : preview.name}: {item.preview}{:else}No messages yet{/if}
                    </span>
                    {#if item.unread > 0}
                      <span class="min-w-5 shrink-0 rounded-full bg-primary px-1.5 text-center text-[0.7rem] leading-5 font-semibold text-primary-foreground">
                        {item.unread > 99 ? '99+' : item.unread}<span class="sr-only"> unread</span>
                      </span>
                    {/if}
                  </span>
                </span>
              </Link>
            </li>
          {/each}
        </ul>
      {/if}
    </nav>
  {/if}

  {#if me && meAuthor}
    <!-- Extra bottom room keeps the fixed "Prototype" badge off the persona card. -->
    <div class={['flex items-center gap-3 border-t border-border px-4 pt-3', DEMO_BADGE_ENABLED ? 'pb-11' : 'pb-3']}>
      <AuthorAvatar author={meAuthor} size="sm" />
      <div class="min-w-0 flex-1 leading-tight">
        <p class="truncate text-sm font-medium">{me.persona.name}</p>
        <p class="truncate text-xs text-muted-foreground">{ROLE_LABELS[me.role ?? ''] ?? me.role ?? 'No role'}</p>
      </div>
    </div>
  {/if}
</div>
