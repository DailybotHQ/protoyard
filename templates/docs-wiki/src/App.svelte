<script lang="ts">
import { BookOpen, Home, Search } from '@lucide/svelte';
import { createRouter, liveQuery, Router, usePrincipal } from '@protoyard/renderer-svelte';
import { AppShell, Avatar, Badge, Header, Sidebar } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import { LucideIcon } from 'texuli/icons/lucide';
import { ROLE_LABELS } from './domain/policy.ts';
import { provideWiki } from './lib/context.ts';
import { routes } from './routes.ts';

const { runtime, db } = provideWiki();
const principal = usePrincipal();

/** Hash routes work on refresh and back/forward on any static host. */
const router = createRouter(routes, { titleSuffix: runtime.manifest.name });
onDestroy(() => router.destroy());

const spaces = liveQuery(() => db.spaces.orderBy('key').toArray(), { initial: [] });
// The space of the open page, so its sidebar entry stays highlighted while reading or editing.
const currentSpace = liveQuery(
  async () => {
    const m = /^\/pages\/([^/]+)/.exec(router.current.path);
    return m ? (await db.pages.get(m[1] as string))?.spaceId : undefined;
  },
  { deps: () => router.current.path }
);
const sections = $derived([
  {
    items: [
      { href: '#/', label: 'Home', icon: Home, active: router.isActive('/', true) },
      { href: '#/search', label: 'Search', icon: Search, active: router.isActive('/search') },
    ],
  },
  {
    label: 'Spaces',
    items: (spaces.current ?? []).map((s) => ({
      href: `#/spaces/${s.id}`,
      label: `${s.icon} ${s.name}`,
      active: router.isActive(`/spaces/${s.id}`) || currentSpace.current === s.id,
    })),
  },
]);
const workspaceName = $derived(principal.current?.organization?.name ?? 'Wiki');
</script>

<AppShell sidebarLabel="Main navigation">
  {#snippet sidebar()}
    <Sidebar {sections} label="Sections" collapsible={false}>
      {#snippet header()}
        <a href="#/" class="flex min-w-0 items-center gap-2.5 rounded-md px-1">
          <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm" aria-hidden="true">
            <LucideIcon icon={BookOpen} class="size-4" />
          </span>
          <span class="truncate text-sm font-semibold">{workspaceName}</span>
        </a>
      {/snippet}
      {#snippet footer()}
        {#if principal.current}
          <!-- Bottom margin keeps the card clear of the fixed "Prototype" badge. -->
          <div class="mb-8 flex items-center gap-3 rounded-lg border border-sidebar-border bg-surface p-3">
            <Avatar name={principal.current.persona.name} src={principal.current.persona.avatar} size="sm" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{principal.current.persona.name}</p>
              <p class="truncate text-xs text-muted-foreground">{principal.current.persona.title}</p>
            </div>
            <Badge variant={principal.current.role === 'viewer' ? 'outline' : 'secondary'}>
              {ROLE_LABELS[principal.current.role ?? ''] ?? principal.current.role}
            </Badge>
          </div>
        {/if}
      {/snippet}
    </Sidebar>
  {/snippet}

  {#snippet header()}
    <Header class="lg:hidden" title={workspaceName} />
  {/snippet}

  <div class="mx-auto w-full max-w-7xl px-4 py-6 pb-safe sm:px-6 lg:px-8">
    <Router {router} />
  </div>
</AppShell>
