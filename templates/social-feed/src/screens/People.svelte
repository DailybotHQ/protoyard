<script lang="ts">
import { Link, liveQuery, usePrincipal } from '@protoyard/renderer-svelte';
import { Avatar, LoadingState } from '@protoyard/ui';
import FollowButton from '../components/FollowButton.svelte';
import { personIdOf, useSocial } from '../lib/context.ts';

const { db } = useSocial();
const principal = usePrincipal();
const me = $derived(personIdOf(principal.current?.persona.id));
const data = liveQuery(
  async () => {
    const [people, follows] = await Promise.all([
      db.people.orderBy('handle').toArray(),
      me ? db.follows.where('followerId').equals(me).toArray() : Promise.resolve([]),
    ]);
    return {
      people: people.filter((p) => p.id !== me),
      following: new Set(follows.map((f) => f.followeeId)),
    };
  },
  { initial: undefined, deps: () => me }
);
</script>

<div class="flex h-full min-h-0 flex-col">
  <h1 class="border-b border-border px-4 py-2 text-lg font-semibold">People</h1>
  <div class="min-h-0 flex-1 overflow-y-auto">
    {#if data.current === undefined}
      <LoadingState label="Loading people" class="py-16" />
    {:else}
      <ul class="divide-y divide-border">
        {#each data.current.people as p (p.id)}
          <li class="flex items-center gap-3 px-4 py-3">
            <Avatar name={p.name} size="sm" />
            <span class="min-w-0 flex-1">
              <Link href={`/people/${p.handle}`} class="block truncate text-sm font-medium hover:underline">{p.name}</Link>
              <span class="block truncate text-xs text-muted-foreground">@{p.handle} · {p.bio}</span>
            </span>
            <FollowButton personId={p.id} name={p.name} following={data.current.following.has(p.id)} />
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
