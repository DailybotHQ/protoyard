<script lang="ts">
import { can, liveQuery, usePrincipal } from '@protoyard/renderer-svelte';
import { Button, EmptyState, LoadingState, VirtualListView } from '@protoyard/ui';
import { Box, Heading, Text } from 'texuli/typography';
import Composer from '../components/Composer.svelte';
import PostCard from '../components/PostCard.svelte';
import type { Post } from '../database/schema.ts';
import { timeline } from '../domain/feed.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { personIdOf, useSocial } from '../lib/context.ts';

const { db } = useSocial();
const principal = usePrincipal();
const me = $derived(personIdOf(principal.current?.persona.id));

let mode = $state<'home' | 'everyone'>('home');
let feed = $state<{ scrollToIndex: (index: number) => void } | null>(null);
/** Back to the newest post (after posting, or switching timelines). */
const toTop = () => feed?.scrollToIndex(0);
// Every post, the people and your follows and reactions; the window keeps rendering cheap.
const data = liveQuery(
  async () => {
    const [posts, people, follows, reactions] = await Promise.all([
      db.posts.toArray(),
      db.people.toArray(),
      me ? db.follows.where('followerId').equals(me).toArray() : Promise.resolve([]),
      me ? db.reactions.where('personId').equals(me).toArray() : Promise.resolve([]),
    ]);
    return {
      posts,
      people: new Map(people.map((p) => [p.id, p])),
      following: new Set(follows.map((f) => f.followeeId)),
      reactions: new Map(reactions.map((r) => [r.postId, r.kind])),
    };
  },
  { initial: undefined, deps: () => me }
);
const posts = $derived(
  data.current ? timeline(data.current.posts, mode, me, data.current.following) : []
);
</script>

<div class="flex h-full min-h-0 flex-col">
  <Box border="block-end" radius="none" padding="none" class="flex items-center justify-between gap-2 px-4 py-2">
    <Heading level={1} size="md">Feed</Heading>
    <Box border="default" radius="md" padding="none" class="inline-flex p-0.5" role="group" aria-label="Timeline">
      <Button size="sm" variant={mode === 'home' ? 'secondary' : 'ghost'} aria-pressed={mode === 'home'} onclick={() => { mode = 'home'; toTop(); }}>Home</Button>
      <Button size="sm" variant={mode === 'everyone' ? 'secondary' : 'ghost'} aria-pressed={mode === 'everyone'} onclick={() => { mode = 'everyone'; toTop(); }}>Everyone</Button>
    </Box>
  </Box>
  {#if can(CAPABILITIES.postsCreate)}
    <Composer onposted={toTop} />
  {:else}
    <Box border="block-end" radius="none" padding="none" class="px-4 py-2" role="note"><Text size="xs" tone="muted">You are reading as a viewer: posting, reacting and following are off.</Text></Box>
  {/if}
  {#if data.current === undefined}
    <LoadingState label="Loading the feed" class="py-16" />
  {:else if posts.length === 0}
    <div class="min-h-0 flex-1 overflow-y-auto p-4">
      <EmptyState
        title={mode === 'home' ? 'Your home feed is empty' : 'Nobody has posted yet'}
        description={mode === 'home' ? 'Follow people or switch to Everyone to see their posts.' : 'Write the first post above.'}
      />
    </div>
  {:else}
    {@const d = data.current}
    <!-- APG feed: articles with their own controls, Page Up / Page Down between posts, no selection. -->
    <VirtualListView
      bind:this={feed}
      mode="feed"
      selectable={false}
      size="fill"
      class="min-h-0 flex-1"
      items={posts}
      getKey={(p: Post) => p.id}
      estimateSize={180}
      overscan={4}
      label="{mode === 'home' ? 'Home' : 'Everyone'} timeline, {posts.length} posts"
    >
      {#snippet row({ item: post }: { item: Post })}
        <PostCard {post} author={d.people.get(post.authorId)} mine={post.authorId === me} myReaction={d.reactions.get(post.id) ?? null} people={d.people} />
      {/snippet}
    </VirtualListView>
  {/if}
</div>
