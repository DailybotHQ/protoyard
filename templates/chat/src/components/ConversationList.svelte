<script lang="ts">
import { MessagesSquare } from '@lucide/svelte';
import {
  can,
  DEMO_BADGE_ENABLED,
  type HashRouter,
  Link,
  useClock,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import { Button, EmptyState } from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import { CAPABILITIES, ROLE_LABELS } from '../domain/policy.ts';
import { authorOf, useChat } from '../lib/context.ts';
import { shortStamp } from '../lib/format.ts';
import Avatar from './Avatar.svelte';

let { router, onNew }: { router: HashRouter; onNew: () => void } = $props();

const { inbox, people } = useChat();
const principal = usePrincipal();
const clock = useClock();

const items = $derived(inbox.current ?? []);
const me = $derived(principal.current);
</script>

<div class="flex h-full min-h-0 flex-col">
  <div class="flex items-center gap-2 px-4 pt-4 pb-3">
    <a href="#/" class="flex min-w-0 flex-1 items-center gap-2.5 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground" aria-hidden="true">
        <LucideIcon icon={MessagesSquare} class="size-4" />
      </span>
      <span class="min-w-0 leading-tight">
        <h1 class="block text-sm font-semibold">Chat</h1>
        <span class="block truncate text-xs text-muted-foreground">{me?.organization?.name ?? 'Workspace'}</span>
      </span>
    </a>
    {#if can(CAPABILITIES.create)}
      <Button size="sm" onclick={onNew}><Icon icon="plus" aria-hidden="true" /> New<span class="sr-only"> conversation</span></Button>
    {/if}
  </div>

  <nav class="min-h-0 flex-1 overflow-y-auto px-2 pb-4" aria-label="Conversations">
    {#if inbox.loading && items.length === 0}
      <p class="px-2 py-6 text-center text-sm text-muted-foreground">Loading…</p>
    {:else if items.length === 0}
      <EmptyState size="sm" title="No conversations yet" description={can(CAPABILITIES.create) ? 'Start one and ask the assistant anything.' : 'Nothing to read yet.'} />
    {:else}
      <ul class="flex flex-col gap-0.5">
        {#each items as item (item.id)}
          <li>
            <Link
              href={`/c/${item.id}`}
              {router}
              class="flex flex-col gap-0.5 rounded-md px-3 py-2 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              activeClass="bg-primary/10 hover:bg-primary/15"
            >
              <span class="flex items-baseline gap-2">
                <span class={['flex-1 truncate text-sm', item.unread > 0 ? 'font-semibold' : 'font-medium text-foreground/90']}>{item.title}</span>
                <span class="shrink-0 text-[0.7rem] text-muted-foreground">{shortStamp(item.lastMessageAt, clock.now)}</span>
              </span>
              <span class="flex items-center gap-2">
                <span class="flex-1 truncate text-xs text-muted-foreground">{item.preview || 'No messages yet'}</span>
                {#if item.unread > 0}
                  <span class="min-w-5 rounded-full bg-primary px-1.5 text-center text-[0.7rem] leading-5 font-semibold text-primary-foreground">
                    {item.unread}<span class="sr-only"> unread</span>
                  </span>
                {/if}
              </span>
            </Link>
          </li>
        {/each}
      </ul>
    {/if}
  </nav>

  {#if me}
    <!-- Extra bottom room keeps the fixed "Prototype" badge off the persona card. -->
    <div class={['flex items-center gap-3 border-t border-border px-4 pt-3', DEMO_BADGE_ENABLED ? 'pb-11' : 'pb-3']}>
      <Avatar author={authorOf(people.current, me.persona.id)} size="sm" />
      <div class="min-w-0 leading-tight">
        <p class="truncate text-sm font-medium">{me.persona.name}</p>
        <p class="truncate text-xs text-muted-foreground">{ROLE_LABELS[me.role ?? ''] ?? me.role}</p>
      </div>
    </div>
  {/if}
</div>
