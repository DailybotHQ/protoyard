<script lang="ts">
import { MessagesSquare } from '@lucide/svelte';
import {
  can,
  DEMO_BADGE_ENABLED,
  type HashRouter,
  useClock,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import { Badge, Button, EmptyState } from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import { ListItem } from 'texuli/list-item';
import { Box, Heading, Text } from 'texuli/typography';
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
    <Button href="#/" variant="ghost" class="h-auto min-w-0 flex-1 justify-start gap-2.5 px-1 py-1">
      <Box surface="muted" radius="lg" padding="none" class="grid size-8 shrink-0 place-items-center" aria-hidden="true">
        <LucideIcon icon={MessagesSquare} tone="primary" class="size-4" />
      </Box>
      <span class="min-w-0 text-left">
        <Heading level={1} size="sm">Chat</Heading>
        <Text as="span" size="xs" tone="muted" truncate class="block">{me?.organization?.name ?? 'Workspace'}</Text>
      </span>
    </Button>
    {#if can(CAPABILITIES.create)}
      <Button size="sm" onclick={onNew}><Icon icon="plus" aria-hidden="true" /> New<span class="sr-only"> conversation</span></Button>
    {/if}
  </div>

  <nav class="min-h-0 flex-1 overflow-y-auto px-2 pb-4" aria-label="Conversations">
    {#if inbox.loading && items.length === 0}
      <Text size="sm" tone="muted" align="center" class="px-2 py-6">Loading…</Text>
    {:else if items.length === 0}
      <EmptyState size="sm" title="No conversations yet" description={can(CAPABILITIES.create) ? 'Start one and ask the assistant anything.' : 'Nothing to read yet.'} />
    {:else}
      <ul class="flex flex-col gap-0.5">
        {#each items as item (item.id)}
          <ListItem
            href={`#/c/${item.id}`}
            current={router.isActive(`/c/${item.id}`)}
            meta={shortStamp(item.lastMessageAt, clock.now)}
          >
            <Text as="span" size="sm" weight={item.unread > 0 ? 'semibold' : 'medium'} truncate class="block">{item.title}</Text>
            <Text as="span" size="xs" tone="muted" truncate class="block">{item.preview || 'No messages yet'}</Text>
            {#snippet trailing()}
              {#if item.unread > 0}
                <Badge variant="default">{item.unread}<span class="sr-only"> unread</span></Badge>
              {/if}
            {/snippet}
          </ListItem>
        {/each}
      </ul>
    {/if}
  </nav>

  {#if me}
    <!-- Extra bottom room keeps the fixed "Prototype" badge off the persona card. -->
    <Box border="block-start" radius="none" padding="none" class={['flex items-center gap-3 px-4 pt-3', DEMO_BADGE_ENABLED ? 'pb-11' : 'pb-3']}>
      <Avatar author={authorOf(people.current, me.persona.id)} size="sm" />
      <div class="min-w-0">
        <Text size="sm" weight="medium" truncate>{me.persona.name}</Text>
        <Text size="xs" tone="muted" truncate>{ROLE_LABELS[me.role ?? ''] ?? me.role}</Text>
      </div>
    </Box>
  {/if}
</div>
