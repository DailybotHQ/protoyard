<script lang="ts">
import { BookOpen, Home, Search } from '@lucide/svelte';
import { createRouter, liveQuery, Router, usePrincipal } from '@protoyard/renderer-svelte';
import { AppShell, Avatar, Badge, Header, Sidebar } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Text } from 'texuli/typography';
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
        <a href="#/" class="flex min-w-0 items-center gap-2.5 px-1">
          <Box surface="muted" radius="lg" padding="sm" class="grid shrink-0 place-items-center" aria-hidden="true">
            <LucideIcon icon={BookOpen} size="sm" tone="primary" />
          </Box>
          <Text as="span" size="sm" weight="semibold" truncate>{workspaceName}</Text>
        </a>
      {/snippet}
      {#snippet footer()}
        {#if principal.current}
          <!-- Bottom margin keeps the card clear of the fixed "Prototype" badge. -->
          <Box border="default" radius="lg" surface="default" class="mb-8 flex items-center gap-3">
            <Avatar name={principal.current.persona.name} src={principal.current.persona.avatar} size="sm" />
            <div class="min-w-0 flex-1">
              <Text size="sm" weight="medium" truncate>{principal.current.persona.name}</Text>
              <Text size="xs" tone="muted" truncate>{principal.current.persona.title}</Text>
            </div>
            <Badge variant={principal.current.role === 'viewer' ? 'outline' : 'secondary'}>
              {ROLE_LABELS[principal.current.role ?? ''] ?? principal.current.role}
            </Badge>
          </Box>
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
