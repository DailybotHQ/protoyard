<script lang="ts">
import { AtSign, Heart, MessageCircle, UserPlus } from '@lucide/svelte';
import {
  can,
  Link,
  liveQuery,
  runService,
  useClock,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import { Button, EmptyState, LoadingState } from '@protoyard/ui';
import type { NotificationKind } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { personIdOf, useSocial } from '../lib/context.ts';
import { fromNow } from '../lib/format.ts';

const { db, services } = useSocial();
const clock = useClock();
const principal = usePrincipal();
const me = $derived(personIdOf(principal.current?.persona.id));
// New items arrive as simulated time advances (the eventStream timeline).
const data = liveQuery(
  async () => {
    if (!me) return { items: [], people: new Map<string, { name: string; handle: string }>() };
    const [items, people] = await Promise.all([
      db.notifications.where('recipientId').equals(me).reverse().sortBy('at'),
      db.people.toArray(),
    ]);
    return { items, people: new Map(people.map((p) => [p.id, p])) };
  },
  { initial: undefined, deps: () => me }
);
const unread = $derived((data.current?.items ?? []).filter((n) => !n.read).length);
const ICONS: Record<NotificationKind, typeof Heart> = {
  reaction: Heart,
  comment: MessageCircle,
  follow: UserPlus,
  mention: AtSign,
};
</script>

<div class="flex h-full min-h-0 flex-col">
  <div class="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
    <h1 class="text-lg font-semibold">Notifications</h1>
    {#if can(CAPABILITIES.interact) && unread > 0}
      <Button size="sm" variant="outline" onclick={() => runService(() => services.notifications.markRead(), { success: 'All caught up' })}>Mark all read</Button>
    {/if}
  </div>
  <div class="min-h-0 flex-1 overflow-y-auto">
    {#if data.current === undefined}
      <LoadingState label="Loading notifications" class="py-16" />
    {:else if data.current.items.length === 0}
      <div class="p-4"><EmptyState title="No notifications yet" description="Reactions, comments, follows and mentions show up here. Advance simulated time in DevTools to see activity arrive." /></div>
    {:else}
      <p class="sr-only" aria-live="polite">{unread} unread</p>
      <ul class="divide-y divide-border">
        {#each data.current.items as n (n.id)}
          {@const Icon = ICONS[n.kind]}
          {@const actor = data.current.people.get(n.actorId)}
          <li class="flex items-center gap-3 px-4 py-3 text-sm {n.read ? '' : 'bg-primary/5'}" data-notification={n.kind}>
            <Icon class="size-4 shrink-0 {n.read ? 'text-muted-foreground' : 'text-primary'}" aria-hidden="true" />
            <span class="min-w-0 flex-1">
              {#if actor}<Link href={`/people/${actor.handle}`} class="font-medium hover:underline">{actor.name}</Link>{/if}
              <span>{n.text.replace(actor?.name ?? '', '').trim()}</span>
              {#if !n.read}<span class="sr-only"> (unread)</span>{/if}
            </span>
            <time class="shrink-0 text-xs text-muted-foreground" datetime={n.at}>{fromNow(n.at, clock.now)}</time>
            {#if !n.read && can(CAPABILITIES.interact)}
              <Button variant="ghost" size="sm" onclick={() => runService(() => services.notifications.markRead(n.id))}>Mark read</Button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
