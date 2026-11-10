<script lang="ts">
import { MessageCircle, Trash2 } from '@lucide/svelte';
import { can, Link, liveQuery, runService, useClock } from '@protoyard/renderer-svelte';
import { Avatar, Button, Input } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Text } from 'texuli/typography';
import {
  type Comment,
  type Person,
  type Post,
  REACTIONS,
  type ReactionKind,
} from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useSocial } from '../lib/context.ts';
import { fromNow } from '../lib/format.ts';
import MediaPlaceholder from './MediaPlaceholder.svelte';

/**
 * One post: author, plain text, a placeholder image, reactions and an
 * expandable comment thread. The feed's own `<article>` (VirtualListView
 * `mode="feed"`) wraps it, so the card is a plain box.
 */
let {
  post,
  author,
  mine,
  myReaction,
  people,
}: {
  post: Post;
  author: Person | undefined;
  /** The post is by the active persona. */
  mine: boolean;
  myReaction: ReactionKind | null;
  people: ReadonlyMap<string, Person>;
} = $props();

const { db, services } = useSocial();
const clock = useClock();
let open = $state(false);
let draft = $state('');
const comments = liveQuery<Comment[]>(
  () =>
    open ? db.comments.where('postId').equals(post.id).sortBy('createdAt') : Promise.resolve([]),
  { initial: [], deps: () => [open, post.id] }
);
const LABELS: Record<ReactionKind, string> = {
  like: '👍 Like',
  celebrate: '🎉 Celebrate',
  insightful: '💡 Insightful',
};
const canInteract = $derived(can(CAPABILITIES.interact));
const canRemove = $derived(
  can(CAPABILITIES.postsCreate) && (mine || can(CAPABILITIES.postsModerate))
);

const react = (kind: ReactionKind) => runService(() => services.reactions.toggle(post.id, kind));
async function comment() {
  const result = await runService(() => services.comments.add(post.id, { text: draft }));
  if (result.ok) draft = '';
}
</script>

<Box border="block-end" radius="none" padding="none" class="px-4 py-3" data-post={post.id}>
  <header class="flex items-start gap-3">
    <Avatar name={author?.name ?? 'Someone'} size="sm" />
    <div class="min-w-0 flex-1">
      <Text id="post-{post.id}-author" size="sm" truncate>
        <Link href={`/people/${author?.handle ?? ''}`}><Text as="span" size="sm" weight="semibold">{author?.name ?? 'Someone'}</Text></Link>
        <Text as="span" size="sm" tone="muted">@{author?.handle} · <time datetime={post.createdAt}>{fromNow(post.createdAt, clock.now)}</time></Text>
      </Text>
      <!-- Plain text: never {@html}; line breaks are kept by CSS. -->
      <Text size="sm" class="mt-1 break-words whitespace-pre-wrap">{post.text}</Text>
      {#if post.media}<MediaPlaceholder media={post.media} />{/if}
      <div class="mt-2 flex flex-wrap items-center gap-1" role="group" aria-label="Reactions">
        {#each REACTIONS as kind (kind)}
          <Button
            variant={myReaction === kind ? 'secondary' : 'ghost'}
            size="sm"
            aria-pressed={myReaction === kind}
            disabled={!canInteract}
            onclick={() => react(kind)}
          >
            <span aria-hidden="true">{LABELS[kind].split(' ')[0]}</span>
            <span class="sr-only">{LABELS[kind].split(' ')[1]}</span>
            <Text as="span" size="sm" tabular>{post.reactionCounts[kind]}</Text>
          </Button>
        {/each}
        <Button variant="ghost" size="sm" aria-expanded={open} onclick={() => (open = !open)}>
          <LucideIcon icon={MessageCircle} class="size-4" />{post.commentCount}<span class="sr-only"> comments</span>
        </Button>
        {#if canRemove}
          <Button class="ml-auto" variant="ghost" size="sm" onclick={() => runService(() => services.posts.remove(post.id), { success: 'Post deleted' })}>
            <LucideIcon icon={Trash2} class="size-4" /><span class="sr-only">Delete post</span>
          </Button>
        {/if}
      </div>
      {#if open}
        <Box as="section" surface="muted" radius="lg" padding="sm" class="mt-2 grid gap-2" aria-label="Comments">
          {#each comments.current ?? [] as c (c.id)}
            <Text size="sm"><Text as="span" size="sm" weight="medium">{people.get(c.authorId)?.name ?? 'Someone'}</Text> <span class="whitespace-pre-wrap">{c.text}</span></Text>
          {:else}
            <Text size="xs" tone="muted">No comments yet.</Text>
          {/each}
          {#if canInteract}
            <form
              class="flex gap-2"
              onsubmit={(e) => {
                e.preventDefault();
              }}
            >
              <Input bind:value={draft} placeholder="Write a comment" aria-label="Write a comment" maxlength={300} class="h-9" />
              <Button size="sm" onclick={comment}>Reply</Button>
            </form>
          {/if}
        </Box>
      {/if}
    </div>
  </header>
</Box>
