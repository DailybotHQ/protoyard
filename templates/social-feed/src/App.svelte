<script lang="ts">
import { Bell, House, UsersRound } from '@lucide/svelte';
import { createRouter, liveQuery, Router, usePrincipal } from '@protoyard/renderer-svelte';
import { Avatar, Badge, BottomNav } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import { LucideIcon } from 'texuli/icons/lucide';
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
<div class="flex h-app max-h-app min-h-0 overflow-hidden bg-background text-foreground">
  <aside class="hidden w-60 shrink-0 flex-col border-r border-border bg-muted/30 p-3 md:flex" aria-label="Main navigation">
    <a href="#/" class="mb-4 flex items-center gap-2 px-2 text-sm font-semibold">
      <span class="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground" aria-hidden="true">F</span>
      {principal.current?.organization?.name ?? 'Feed'}
    </a>
    <nav aria-label="Sections">
      <ul class="grid gap-1">
        {#each nav as item (item.href)}
          {@const Icon = item.icon}
          <li>
            <a href={item.href} aria-current={item.active ? 'page' : undefined} class="flex items-center gap-2 rounded-md px-2 py-2 text-sm {item.active ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted'}">
              <LucideIcon icon={Icon} class="size-4" />{item.label}
              {#if item.badge}<Badge class="ml-auto">{item.badge}<span class="sr-only"> unread</span></Badge>{/if}
            </a>
          </li>
        {/each}
      </ul>
    </nav>
    {#if principal.current}
      <div class="mt-auto mb-8 flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
        <Avatar name={principal.current.persona.name} src={principal.current.persona.avatar} size="sm" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">{principal.current.persona.name}</p>
          <p class="truncate text-xs text-muted-foreground">{ROLE_LABELS[principal.current.role ?? ''] ?? principal.current.role}</p>
        </div>
      </div>
    {/if}
  </aside>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <main id="main-content" class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Router {router} />
    </main>
    <BottomNav class="shrink-0 md:hidden" fixed={false} label="Sections" items={nav} />
  </div>
</div>
