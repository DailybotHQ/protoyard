<script lang="ts">
import {
  Accessibility,
  Blocks,
  ClipboardList,
  LayoutGrid,
  Palette,
  Shapes,
  Star,
} from '@lucide/svelte';
import { createRouter, Router, usePrincipal } from '@protoyard/renderer-svelte';
import { AppShell, Avatar, Badge, Header, Sidebar, type SidebarSection } from '@protoyard/ui';
import { CATALOG, CATALOG_GROUPS } from './catalog/entries.ts';
import { useFavorites } from './lib/favorites.svelte.ts';
import OverviewPage from './screens/OverviewPage.svelte';

const router = createRouter(
  [
    { path: '/', component: OverviewPage, title: 'Overview' },
    {
      path: '/components/:group',
      load: () => import('./screens/GroupPage.svelte'),
      title: 'Components',
    },
    { path: '/c/:id', load: () => import('./screens/EntryPage.svelte'), title: 'Component' },
    { path: '/themes', load: () => import('./screens/ThemeLabPage.svelte'), title: 'Theme lab' },
    { path: '/forms', load: () => import('./screens/FormsPage.svelte'), title: 'Forms' },
    { path: '/a11y', load: () => import('./screens/A11yPage.svelte'), title: 'Accessibility' },
    {
      path: '/favorites',
      load: () => import('./screens/FavoritesPage.svelte'),
      title: 'Favorites',
    },
  ],
  { titleSuffix: 'Protoyard UI Kit' }
);

const principal = usePrincipal();
const favorites = useFavorites();
let sidebarOpen = $state(false);
let collapsed = $state(false);

const sections = $derived<SidebarSection[]>([
  {
    items: [
      { label: 'Overview', href: '#/', icon: LayoutGrid, active: router.isActive('/', true) },
      { label: 'Theme lab', href: '#/themes', icon: Palette, active: router.isActive('/themes') },
      { label: 'Forms', href: '#/forms', icon: ClipboardList, active: router.isActive('/forms') },
      {
        label: 'Favorites',
        href: '#/favorites',
        icon: Star,
        badge: favorites.list.length || undefined,
        active: router.isActive('/favorites'),
      },
      {
        label: 'Accessibility',
        href: '#/a11y',
        icon: Accessibility,
        active: router.isActive('/a11y'),
      },
    ],
  },
  {
    label: 'Components',
    items: CATALOG_GROUPS.filter((g) => g.id !== 'patterns').map((group) => ({
      label: group.name,
      href: `#/components/${group.id}`,
      icon: Blocks,
      badge: CATALOG.filter((e) => e.group === group.id).length,
      active:
        router.isActive(`/components/${group.id}`) ||
        (router.current.route?.path === '/c/:id' &&
          CATALOG.find((e) => e.id === router.current.params.id)?.group === group.id),
    })),
  },
  {
    label: 'Patterns',
    items: [
      {
        label: 'All patterns',
        href: '#/components/patterns',
        icon: Shapes,
        active:
          router.isActive('/components/patterns') ||
          (router.current.route?.path === '/c/:id' &&
            (router.current.params.id ?? '').startsWith('pattern-')),
      },
    ],
  },
]);
const pageTitle = $derived(router.current.route?.title ?? 'Not found');
</script>

<AppShell bind:sidebarOpen sidebarLabel="UI Kit navigation">
  {#snippet sidebar()}
    <Sidebar bind:collapsed {sections} label="UI Kit">
      {#snippet header({ collapsed: isCollapsed })}
        <a href="#/" class="flex items-center gap-2 px-1 font-semibold tracking-tight">
          <span class="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm text-primary-foreground" aria-hidden="true">🧩</span>
          {#if !isCollapsed}<span class="truncate">Protoyard UI Kit</span>{/if}
        </a>
      {/snippet}
    </Sidebar>
  {/snippet}
  {#snippet header()}
    <Header title={pageTitle} titleAs="p">
      {#snippet actions()}
        {#if principal.current}
          {#if principal.current.role === 'viewer'}<Badge variant="secondary">Read-only</Badge>{/if}
          <span class="hidden text-sm text-muted-foreground sm:inline">{principal.current.persona.name}</span>
          <Avatar name={principal.current.persona.name} size="sm" decorative />
        {/if}
      {/snippet}
    </Header>
  {/snippet}
  <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
    <Router {router} />
  </div>
</AppShell>
