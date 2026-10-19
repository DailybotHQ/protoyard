<script lang="ts">
import type { ReviewAuthor, ReviewComment } from '@protoyard/core/review';
import { ReviewAuthorSchema } from '@protoyard/core/review';
import { runService } from '@protoyard/renderer-svelte';
import { BottomSheet, Button, Popover, type TriggerSnippet } from '@protoyard/ui';
import { type ActivityComment } from '@protoyard/views/activity';
import { type ActivityPerson, CommentThread } from '@protoyard/views-ui/activity';
import { onMount } from 'svelte';

let {
  open = $bindable(true),
  trigger,
  slug,
  threadId,
  comments,
  now = new Date(),
  mobile = false,
  onSend,
  onEdit,
  onDelete,
  onReact,
  onResolve,
}: {
  open?: boolean;
  trigger?: TriggerSnippet;
  slug: string;
  threadId: string;
  comments: readonly ReviewComment[];
  now?: string | number | Date;
  mobile?: boolean;
  onSend: (input: { body: string; threadId: string; author: ReviewAuthor }) => unknown;
  onEdit?: (comment: ReviewComment, body: string) => unknown;
  onDelete?: (comment: ReviewComment) => unknown;
  onReact?: (comment: ReviewComment, emoji: string, author: ReviewAuthor) => unknown;
  onResolve: (comment: ReviewComment, author: ReviewAuthor, resolved: boolean) => unknown;
} = $props();

const storageKey = $derived(`py-review-author:${slug}`);
let author = $state<ReviewAuthor | undefined>();
let nameDraft = $state('');
let nameError = $state('');
let actionError = $state('');
let resolving = $state(false);

onMount(() => {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = ReviewAuthorSchema.safeParse(JSON.parse(stored));
      if (parsed.success) author = parsed.data;
    }
  } catch {
    // The prompt remains available when storage is disabled or malformed.
  }
});

const threadComments = $derived(comments.filter((comment) => comment.threadId === threadId));
const root = $derived(threadComments.find((comment) => comment.id === threadId));
const people = $derived.by(() => {
  const seen = new Map<string, ActivityPerson>();
  for (const comment of threadComments) {
    seen.set(comment.author.clientId, { id: comment.author.clientId, name: comment.author.name });
  }
  if (author) seen.set(author.clientId, { id: author.clientId, name: author.name });
  return [...seen.values()];
});
const activityComments = $derived(
  threadComments.map(
    (comment): ActivityComment => ({
      id: comment.id,
      parentId: comment.id === comment.threadId ? null : comment.threadId,
      authorId: comment.author.clientId,
      body: comment.body,
      createdAt: comment.createdAt,
      editedAt: comment.editedAt,
      reactions: comment.reactions,
    })
  )
);
const byId = $derived(new Map(threadComments.map((comment) => [comment.id, comment])));

function makeClientId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `review_${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function saveName() {
  const candidate = ReviewAuthorSchema.safeParse({
    name: nameDraft.trim(),
    clientId: author?.clientId ?? makeClientId(),
  });
  if (!candidate.success) {
    nameError = candidate.error.issues[0]?.message ?? 'Enter a valid name.';
    return;
  }
  author = candidate.data;
  nameError = '';
  try {
    localStorage.setItem(storageKey, JSON.stringify(author));
  } catch {
    nameError =
      'Your name could not be saved in this browser. Please allow local storage and try again.';
    author = undefined;
  }
}

async function resolveThread() {
  if (!author || !root || resolving) return;
  resolving = true;
  actionError = '';
  const result = await runService(() => onResolve(root, author as ReviewAuthor, !root.resolvedAt));
  resolving = false;
  if (!result.ok)
    actionError =
      result.error instanceof Error ? result.error.message : 'Could not update this thread.';
}

async function edit(comment: ActivityComment, body: string) {
  const reviewComment = byId.get(comment.id);
  if (reviewComment && onEdit) await onEdit(reviewComment, body);
}

async function remove(comment: ActivityComment) {
  const reviewComment = byId.get(comment.id);
  if (reviewComment && onDelete) await onDelete(reviewComment);
}

async function react(comment: ActivityComment, emoji: string) {
  const reviewComment = byId.get(comment.id);
  if (reviewComment && author && onReact) await onReact(reviewComment, emoji, author);
}
</script>

{#snippet panel()}
  <section class="grid gap-3" aria-label="Comment thread">
    {#if !author}
      <form class="grid gap-2" onsubmit={(event) => { event.preventDefault(); saveName(); }}>
        <h2 class="font-semibold">Choose your name</h2>
        <p class="text-sm text-muted-foreground">Your name is shown to other reviewers. It is not a login.</p>
        <label class="grid gap-1 text-sm" for="review-display-name">Your name</label>
        <input id="review-display-name" bind:value={nameDraft} maxlength="60" required class="rounded-md border border-input bg-surface px-3 py-2 text-sm" />
        {#if nameError}<p role="alert" class="text-sm text-destructive">{nameError}</p>{/if}
        <Button type="submit" disabled={!nameDraft.trim()}>Continue</Button>
      </form>
    {:else if root}
      <header class="flex items-center justify-between gap-2">
        <h2 class="font-semibold">Thread by {root.author.name}</h2>
        <Button size="sm" variant="outline" disabled={resolving} loading={resolving} onclick={resolveThread}>
          {root.resolvedAt ? 'Reopen' : 'Resolve'}
        </Button>
      </header>
      {#if actionError}<p role="alert" class="text-sm text-destructive">{actionError}</p>{/if}
      <CommentThread
        query={{ current: activityComments, loading: false, error: undefined }}
        {people}
        currentUserId={author.clientId}
        {now}
        onSend={({ body }) => onSend({ body, threadId, author: author as ReviewAuthor })}
        onEdit={onEdit ? edit : undefined}
        onDelete={onDelete ? remove : undefined}
        onReact={onReact ? react : undefined}
      />
    {:else}
      <p role="alert" class="text-sm">This thread is no longer available.</p>
    {/if}
  </section>
{/snippet}

{#snippet defaultTrigger({ props }: { props: Record<string, unknown> })}
  <Button {...props} variant="outline" size="sm">Open comment thread</Button>
{/snippet}

{#if mobile}
  <BottomSheet bind:open title="Comment thread" trigger={trigger ?? defaultTrigger} class="max-h-[90dvh]">
    {@render panel()}
  </BottomSheet>
{:else}
  <Popover bind:open trigger={trigger ?? defaultTrigger} class="max-h-[min(75vh,40rem)] w-[min(28rem,calc(100vw-2rem))] overflow-y-auto">
    {@render panel()}
  </Popover>
{/if}
