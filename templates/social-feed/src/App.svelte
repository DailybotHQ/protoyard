<script lang="ts">
import { Bell, House, UsersRound } from '@lucide/svelte';
import { createRouter, liveQuery, Router, usePrincipal } from '@protoyard/renderer-svelte';
import { Avatar, Badge, BottomNav, Button, Separator } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Text } from 'texuli/typography';
import { ROLE_LABELS } from './domain/policy.ts';
import { personIdOf, provideSocial } from './lib/context.ts';
import { routes } from './routes.ts';

const { runtime, db } = provideSocial();
const principal = usePrincipal();

/** Hash routes work on refresh and back/forward on any static host. Add screens here AND in `nav`. */
const router = createRouter(routes, { titleSuffix: runtime.manifest.name });
onDestroy(() => router.destroy());

const me = $derived(personIdOf(principal.current?.persona.id));
const unread = liveQuery(
  async () =>
    me
      ? (await db.notifications.where('recipientId').equals(me).toArray()).filter((n) => !n.read)
          .length
      : 0,
  { initial: 0, deps: () => me }
);
const nav = $derived([
  { href: '#/', label: 'Feed', icon: House, active: router.isActive('/', true) },
  {
    href: '#/notifications',
    label: 'Notifications',
    icon: Bell,
    active: router.isActive('/notifications'),
    badge: unread.current || undefined,
  },
  { href: '#/people', label: 'People', icon: UsersRound, active: router.isActive('/people') },
]);
</script>

<!-- The app is bound to the window height: each screen's own region scrolls, never the document. -->
<div class="flex h-app max-h-app min-h-0 overflow-hidden">
  <Box as="aside" surface="subtle" radius="none" padding="sm" class="hidden w-60 shrink-0 flex-col md:flex" aria-label="Main navigation">
    <a href="#/" class="mb-4 flex items-center gap-2 px-2">
      <Avatar name="F" tone="primary" shape="square" size="sm" decorative />
      <Text as="span" size="sm" weight="semibold">{principal.current?.organization?.name ?? 'Feed'}</Text>
    </a>
    <nav aria-label="Sections">
      <ul class="grid gap-1">
        {#each nav as item (item.href)}
          {@const Icon = item.icon}
          <li>
            <Button href={item.href} variant={item.active ? 'secondary' : 'ghost'} size="sm" aria-current={item.active ? 'page' : undefined} class="w-full justify-start gap-2 px-2">
              <LucideIcon icon={Icon} size="sm" tone={item.active ? 'primary' : 'default'} />{item.label}
              {#if item.badge}<Badge class="ml-auto">{item.badge}<span class="sr-only"> unread</span></Badge>{/if}
            </Button>
          </li>
        {/each}
      </ul>
    </nav>
    {#if principal.current}
      <Box surface="default" border="default" radius="lg" padding="sm" class="mt-auto mb-8 flex items-center gap-3">
        <Avatar name={principal.current.persona.name} src={principal.current.persona.avatar} size="sm" />
        <div class="min-w-0 flex-1">
          <Text size="sm" weight="medium" truncate>{principal.current.persona.name}</Text>
          <Text size="xs" tone="muted" truncate>{ROLE_LABELS[principal.current.role ?? ''] ?? principal.current.role}</Text>
        </div>
      </Box>
    {/if}
  </Box>
  <Separator orientation="vertical" class="hidden md:block" />
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <main id="main-content" class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Router {router} />
    </main>
    <BottomNav class="shrink-0 md:hidden" fixed={false} label="Sections" items={nav} />
  </div>
</div>
