<script lang="ts" generics="C extends ActivityComment">
import { runService } from '@protoyard/renderer-svelte';
import { Avatar, Button, Spinner } from '@protoyard/ui';
import { type ActivityComment, buildThreads, tokenize, whenLabel } from '@protoyard/views/activity';
import type { Component } from 'svelte';
import { onMount } from 'svelte';
import { lazyDialog } from '../lib/lazy-overlays.svelte.ts';
import QueryState from '../states/QueryState.svelte';
import Composer from './Composer.svelte';
import Segments from './Segments.svelte';
import {
  type ActivityPerson,
  type ActivityRecord,
  type EditorLoader,
  handleOf,
  personImage,
} from './types.ts';

/**
 * Comments on a record: threads with replies, edit and delete for what
 * `canEdit` allows, reactions, and a composer with `@` mentions and `#`
 * references stored as ids. Every write goes through a callback (a service,
 * which still enforces policy); a new comment shows as sending until it lands.
 */
let {
  query,
  people,
  records = [],
  currentUserId,
  canEdit = (comment: C) => comment.authorId === currentUserId,
  onSend,
  onEdit,
  onDelete,
  onReact,
  onOpenReference,
  loadEditor,
  avatarSrc,
  reactions = ['👍', '🎉', '❤️', '👀'],
  now,
  timeZone = 'UTC',
  locale = 'en-US',
  label = 'Comments',
  onRetry,
}: {
  query: { readonly current: C[] | undefined; readonly loading: boolean; readonly error: unknown };
  people: readonly ActivityPerson[];
  records?: readonly ActivityRecord[];
  currentUserId: string;
  /** Shows edit and delete for a comment (default: your own). The service still checks. */
  canEdit?: (comment: C) => boolean;
  onSend: (input: { body: string; parentId: string | null }) => unknown;
  onEdit?: (comment: C, body: string) => unknown;
  onDelete?: (comment: C) => unknown;
  /** Toggles the current user's reaction. */
  onReact?: (comment: C, emoji: string) => unknown;
  onOpenReference?: (id: string) => void;
  /** Lazily loads the rich composer: a function resolving to the editor view's MarkdownEditor (see the README). */
  loadEditor?: EditorLoader;
  /** Overrides how a person's image resolves (default: `persona.avatar` through the renderer's `avatarImage`). */
  avatarSrc?: (person: ActivityPerson) => string | null | undefined;
  reactions?: readonly string[];
  /** The runtime clock's now, for "Today, 3:04 PM". */
  now: string | number | Date;
  timeZone?: string;
  locale?: string;
  label?: string;
  onRetry?: () => void | Promise<void>;
} = $props();

const defaultEditorLoader: EditorLoader = () =>
  import('@protoyard/views-ui/editor').then((module) => module.MarkdownEditor);
const effectiveLoadEditor = $derived(loadEditor ?? defaultEditorLoader);
let MarkdownPreview = $state<Component<{
  source: string;
  label?: string;
  class?: string;
  onLinkClick?: (href: string) => boolean;
}> | null>(null);
onMount(() => {
  void import('@protoyard/views-ui/editor').then((module) => {
    MarkdownPreview = module.MarkdownPreview;
  });
});

const byId = $derived(new Map(people.map((p) => [p.id, p])));
const recordById = $derived(new Map(records.map((r) => [r.id, r])));
const lookups = $derived({
  person: (id: string) => byId.get(id)?.name,
  record: (id: string) => recordById.get(id)?.label,
});
function markdownBody(body: string): string {
  return tokenize(body, lookups)
    .map((segment) => {
      if (segment.type === 'text') return segment.text;
      if (segment.type === 'mention') return `@${segment.label}`;
      if (segment.type === 'reference' && onOpenReference && !segment.missing) {
        const label = `#${segment.label.replace(/[\\[\]]/g, '\\$&')}`;
        return `[${label}](#/__reference/${encodeURIComponent(segment.id)})`;
      }
      return `#${segment.label}`;
    })
    .join('');
}
const handleMarkdownLink = (href: string) => {
  const prefix = '#/__reference/';
  if (!href.startsWith(prefix) || !onOpenReference) return false;
  onOpenReference(decodeURIComponent(href.slice(prefix.length)));
  return true;
};
const mentions = $derived(people.map((p) => ({ id: p.id, value: handleOf(p), label: p.name })));
const references = $derived(
  records.map((r) => ({ id: r.id, value: r.value ?? r.id, label: r.label }))
);
const threads = $derived(buildThreads(query.current ?? []));
const me = $derived(byId.get(currentUserId));

let sending = $state<{ key: number; body: string; parentId: string | null }[]>([]);
let replyTo = $state<string | null>(null);
let editing = $state<string | null>(null);
let deleting = $state<C | null>(null);
let confirmOpen = $state(false);
let picker = $state<string | null>(null);
let nextKey = 0;

async function send(body: string, parentId: string | null) {
  const key = ++nextKey;
  sending = [...sending, { key, body, parentId }];
  try {
    await onSend({ body, parentId });
    if (parentId) replyTo = null;
  } finally {
    sending = sending.filter((s) => s.key !== key);
  }
}

const nameOf = (id: string) => byId.get(id)?.name ?? 'Someone';
</script>

{#snippet person(id: string, size: 'sm' | 'xs' = 'sm')}
  {@const who = byId.get(id)}
  <Avatar name={who?.name ?? 'Someone'} {...personImage(who, avatarSrc)} {size} decorative />
{/snippet}

{#snippet commentItem(comment: C, isReply: boolean)}
  {@const own = canEdit(comment)}
  <article class="flex gap-3" aria-label={`${nameOf(comment.authorId)}, ${whenLabel(comment.createdAt, { now, timeZone, locale })}`}>
    {@render person(comment.authorId, isReply ? 'xs' : 'sm')}
    <div class="min-w-0 flex-1">
      <p class="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span class="font-medium">{nameOf(comment.authorId)}</span>
        <time class="text-xs text-muted-foreground" datetime={comment.createdAt}>{whenLabel(comment.createdAt, { now, timeZone, locale })}</time>
        {#if comment.editedAt && !comment.deletedAt}<span class="text-xs text-muted-foreground">(edited)</span>{/if}
      </p>
      {#if comment.deletedAt}
        <p class="text-sm text-muted-foreground italic">This comment was deleted.</p>
      {:else if editing === comment.id && onEdit}
        <Composer
          label={`Edit comment by ${nameOf(comment.authorId)}`}
          initial={comment.body}
          submitLabel="Save"
          {mentions}
          {references}
          loadEditor={effectiveLoadEditor}
          autofocus
          onSubmit={async (body) => {
            await onEdit(comment, body);
            editing = null;
          }}
          onCancel={() => (editing = null)}
        />
      {:else}
        {#if MarkdownPreview}
          {@const source = markdownBody(comment.body)}
          <MarkdownPreview {source} label="Comment" class="text-sm" onLinkClick={handleMarkdownLink} />
        {:else}
          <p class="text-sm break-words whitespace-pre-wrap"><Segments segments={tokenize(comment.body, lookups)} {onOpenReference} /></p>
        {/if}
        <div class="mt-1 flex flex-wrap items-center gap-1">
          {#each Object.entries(comment.reactions ?? {}) as [emoji, ids] (emoji)}
            {#if ids.length}
              {@const mine = ids.includes(currentUserId)}
              <Button
                variant={mine ? 'secondary' : 'outline'}
                size="sm"
                class="h-7 px-2"
                aria-pressed={mine}
                aria-label={`${emoji} ${ids.length}: ${ids.map(nameOf).join(', ')}`}
                disabled={!onReact}
                onclick={() => runService(() => onReact?.(comment, emoji))}
              >{emoji} {ids.length}</Button>
            {/if}
          {/each}
          {#if onReact}
            <Button variant="ghost" size="sm" class="h-7 px-2" aria-expanded={picker === comment.id} onclick={() => (picker = picker === comment.id ? null : comment.id)}>
              React
            </Button>
          {/if}
          {#if !isReply}
            <Button variant="ghost" size="sm" class="h-7 px-2" onclick={() => (replyTo = replyTo === comment.id ? null : comment.id)}>Reply</Button>
          {/if}
          {#if own && onEdit}
            <Button variant="ghost" size="sm" class="h-7 px-2" onclick={() => (editing = comment.id)}>Edit</Button>
          {/if}
          {#if own && onDelete}
            <!-- The confirmation's Bits UI code loads on the first Delete (the button shows it pending). -->
            <Button variant="ghost" size="sm" class="h-7 px-2" onclick={() =>
              lazyDialog.load().then(() => {
                deleting = comment;
                confirmOpen = true;
              })}>Delete</Button>
          {/if}
        </div>
        {#if picker === comment.id && onReact}
          <div role="group" aria-label="Reactions" class="mt-1 flex gap-1">
            {#each reactions as emoji (emoji)}
              <Button
                variant="outline"
                size="sm"
                class="h-7 px-2"
                aria-label={`React with ${emoji}`}
                onclick={async () => {
                  const result = await runService(() => onReact(comment, emoji));
                  if (result.ok) picker = null;
                }}
              >{emoji}</Button>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  </article>
{/snippet}

{#snippet pendingItem(body: string)}
  <article class="flex gap-3 opacity-70" aria-busy="true" aria-label="Sending comment">
    {@render person(currentUserId)}
    <div class="min-w-0 flex-1">
      <p class="flex items-center gap-2 text-sm">
        <span class="font-medium">{me?.name ?? 'You'}</span>
        <span class="flex items-center gap-1 text-xs text-muted-foreground"><Spinner class="size-3" />Sending…</span>
      </p>
      {#if MarkdownPreview}
        {@const source = markdownBody(body)}
        <MarkdownPreview {source} label="Pending comment" class="text-sm" onLinkClick={handleMarkdownLink} />
      {:else}
        <p class="text-sm break-words whitespace-pre-wrap"><Segments segments={tokenize(body, lookups)} /></p>
      {/if}
    </div>
  </article>
{/snippet}

<section aria-label={label} class="grid gap-4">
  <QueryState {query} label={`Loading ${label.toLowerCase()}`} isEmpty={() => false} {onRetry}>
    {#snippet children()}
      {#if threads.length === 0 && sending.length === 0}
        <p class="text-sm text-muted-foreground">No comments yet. Start the conversation.</p>
      {/if}
      <ol class="grid gap-4">
        {#each threads as thread (thread.comment.id)}
          <li class="grid gap-3">
            {@render commentItem(thread.comment, false)}
            {#if thread.replies.length || replyTo === thread.comment.id || sending.some((s) => s.parentId === thread.comment.id)}
              <ol class="ml-10 grid gap-3 border-l border-border pl-3" aria-label={`Replies to ${nameOf(thread.comment.authorId)}`}>
                {#each thread.replies as reply (reply.id)}<li>{@render commentItem(reply, true)}</li>{/each}
                {#each sending.filter((s) => s.parentId === thread.comment.id) as pending (pending.key)}<li>{@render pendingItem(pending.body)}</li>{/each}
                {#if replyTo === thread.comment.id}
                  <li>
                    <Composer
                      label={`Reply to ${nameOf(thread.comment.authorId)}`}
                      submitLabel="Send reply"
                      {mentions}
                      {references}
                      loadEditor={effectiveLoadEditor}
                      autofocus
                      onSubmit={(body) => send(body, thread.comment.id)}
                      onCancel={() => (replyTo = null)}
                    />
                  </li>
                {/if}
              </ol>
            {/if}
          </li>
        {/each}
        {#each sending.filter((s) => s.parentId === null) as pending (pending.key)}<li>{@render pendingItem(pending.body)}</li>{/each}
      </ol>
      <Composer label="Add a comment" {mentions} {references} loadEditor={effectiveLoadEditor} onSubmit={(body) => send(body, null)} />
    {/snippet}
  </QueryState>
</section>

{#if deleting && onDelete && lazyDialog.current}
  {@const target = deleting}
  {@const AlertDialog = lazyDialog.current}
  <!-- The dialog stays open with the reason when deleting fails. -->
  <AlertDialog
    bind:open={confirmOpen}
    title="Delete this comment?"
    description="Replies stay; the comment is replaced by a note that it was deleted."
    confirmLabel="Delete comment"
    destructive
    onConfirm={async () => {
      await onDelete(target);
    }}
  />
{/if}
