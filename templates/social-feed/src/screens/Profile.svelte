<script lang="ts">
import { ArrowLeft } from '@lucide/svelte';
import { Link, liveQuery, usePrincipal } from '@protoyard/renderer-svelte';
import { Avatar, EmptyState, LoadingState } from '@protoyard/ui';
import FollowButton from '../components/FollowButton.svelte';
import PostCard from '../components/PostCard.svelte';
import VirtualFeed from '../components/VirtualFeed.svelte';
import type { Post } from '../database/schema.ts';
import { byNewest } from '../domain/feed.ts';
import { personIdOf, useSocial } from '../lib/context.ts';

let { params }: { params: { handle?: string } } = $props();
const { db } = useSocial();
const principal = usePrincipal();
const me = $derived(personIdOf(principal.current?.persona.id));
const handle = $derived(params.handle ?? '');
const data = liveQuery(
  async () => {
    const person = await db.people.where('handle').equals(handle).first();
    if (!person) return { person: undefined };
    const [posts, people, followers, following, myFollow, reactions] = await Promise.all([
      db.posts.where('authorId').equals(person.id).toArray(),
      db.people.toArray(),
      db.follows.where('followeeId').equals(person.id).count(),
      db.follows.where('followerId').equals(person.id).count(),
      me
        ? db.follows.where('[followerId+followeeId]').equals([me, person.id]).first()
        : Promise.resolve(undefined),
      me ? db.reactions.where('personId').equals(me).toArray() : Promise.resolve([]),
    ]);
    return {
      person,
      posts: posts.sort(byNewest),
      people: new Map(people.map((p) => [p.id, p])),
      followers,
      following,
      followed: Boolean(myFollow),
      reactions: new Map(reactions.map((r) => [r.postId, r.kind])),
    };
  },
  { initial: undefined, deps: () => [handle, me] }
);
</script>

<div class="flex h-full min-h-0 flex-col">
  <div class="border-b border-border px-4 py-2">
    <Link href="/people" class="inline-flex items-center gap-1 text-sm text-primary hover:underline"><ArrowLeft class="size-4" aria-hidden="true" />People</Link>
  </div>
  {#if data.current === undefined}
    <LoadingState label="Loading profile" class="py-16" />
  {:else if !data.current.person}
    <div class="p-4"><EmptyState title="No one by that handle" description="They may not be part of this scenario's network." /></div>
  {:else}
    {@const d = data.current}
    {@const person = d.person}
    <section class="flex items-center gap-3 border-b border-border px-4 py-3" aria-label="Profile">
      <Avatar name={person.name} />
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-lg font-semibold">{person.name}</h1>
        <p class="truncate text-sm text-muted-foreground">@{person.handle} · {person.bio}</p>
        <p class="text-xs text-muted-foreground">{d.followers} followers · {d.following} following · {d.posts?.length ?? 0} posts</p>
      </div>
      {#if person.id !== me}<FollowButton personId={person.id} name={person.name} following={d.followed ?? false} />{/if}
    </section>
    {#if (d.posts ?? []).length === 0}
      <div class="p-4"><EmptyState title="No posts yet" /></div>
    {:else}
      <VirtualFeed items={d.posts ?? []} key={(p: Post) => p.id} label="Posts by {person.name}">
        {#snippet row(post: Post)}
          <PostCard {post} author={person} mine={post.authorId === me} myReaction={d.reactions?.get(post.id) ?? null} people={d.people ?? new Map()} />
        {/snippet}
      </VirtualFeed>
    {/if}
  {/if}
</div>
