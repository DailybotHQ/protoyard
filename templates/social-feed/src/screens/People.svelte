<script lang="ts">
import { Link, liveQuery, usePrincipal } from '@protoyard/renderer-svelte';
import { Avatar, LoadingState } from '@protoyard/ui';
import { Box, Heading, Text } from 'texuli/typography';
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
  <Box border="block-end" radius="none" padding="none" class="px-4 py-2"><Heading level={1} size="md">People</Heading></Box>
  <div class="min-h-0 flex-1 overflow-y-auto">
    {#if data.current === undefined}
      <LoadingState label="Loading people" class="py-16" />
    {:else}
      <ul>
        {#each data.current.people as p, index (p.id)}
          <li>
            <Box border={index > 0 ? 'block-start' : 'none'} radius="none" padding="none" class="flex items-center gap-3 px-4 py-3">
            <Avatar name={p.name} size="sm" />
            <span class="min-w-0 flex-1">
              <Link href={`/people/${p.handle}`} class="block min-w-0"><Text as="span" size="sm" weight="medium" truncate class="block">{p.name}</Text></Link>
              <Text as="span" size="xs" tone="muted" truncate class="block">@{p.handle} · {p.bio}</Text>
            </span>
            <FollowButton personId={p.id} name={p.name} following={data.current.following.has(p.id)} />
            </Box>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
