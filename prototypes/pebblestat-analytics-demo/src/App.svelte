<script lang="ts">
import {
  Activity,
  Bell,
  Bookmark,
  Filter,
  Funnel,
  LayoutDashboard,
  Repeat,
  TrendingUp,
  UsersRound,
} from '@lucide/svelte';
import {
  avatarImage,
  createRouter,
  liveQuery,
  Router,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import { AppShell, Avatar, Badge, Header, Select, Sidebar } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import { ROLE_LABELS } from './domain/policy.ts';
import { provideAnalytics } from './lib/context.ts';
import { currentProject, DEFAULT_PROJECT } from './lib/project.svelte.ts';
import { routes } from './routes.ts';

const { runtime, db } = provideAnalytics();
const principal = usePrincipal();

/** Hash routes work on refresh and back/forward on any static host. Add screens here AND in `nav`. */
const router = createRouter(routes, { titleSuffix: runtime.manifest.name });
onDestroy(() => router.destroy());

const projects = liveQuery(() => db.projects.toArray(), { initial: [] });
// Alerts firing in the current project, as a badge on the nav item.
const firing = liveQuery(
  async () =>
    (await db.alerts.where('projectId').equals(currentProject.id).toArray()).filter(
      (a) => a.status === 'firing' && !a.muted
    ).length,
  { initial: 0, deps: () => currentProject.id }
);
const nav = $derived([
  { href: '#/', label: 'Overview', icon: LayoutDashboard, active: router.isActive('/', true) },
  { href: '#/trends', label: 'Insights', icon: TrendingUp, active: router.isActive('/trends') },
  { href: '#/funnels', label: 'Funnels', icon: Funnel, active: router.isActive('/funnels') },
  { href: '#/retention', label: 'Retention', icon: Repeat, active: router.isActive('/retention') },
  { href: '#/users', label: 'Users', icon: UsersRound, active: router.isActive('/users') },
  { href: '#/reports', label: 'Reports', icon: Bookmark, active: router.isActive('/reports') },
  {
    href: '#/alerts',
    label: 'Alerts',
    icon: Bell,
    active: router.isActive('/alerts'),
    badge: firing.current || undefined,
  },
  { href: '#/live', label: 'Live', icon: Activity, active: router.isActive('/live') },
  { href: '#/segments', label: 'Segments', icon: Filter, active: router.isActive('/segments') },
]);
const workspaceName = $derived(principal.current?.organization?.name ?? 'Pebblestat');
// A scenario load can replace the projects: fall back to the default one.
$effect(() => {
  const list = projects.current ?? [];
  if (list.length > 0 && !list.some((p) => p.id === currentProject.id))
    currentProject.set(list[0]?.id ?? DEFAULT_PROJECT);
});
</script>

<AppShell sidebarLabel="Main navigation">
  {#snippet sidebar()}
    <Sidebar items={nav} label="Sections" collapsible={false}>
      {#snippet header()}
        <a href="#/" class="flex min-w-0 items-center gap-2.5 rounded-md px-1">
          <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm" aria-hidden="true">
            <TrendingUp class="size-4" />
          </span>
          <span class="truncate text-sm font-semibold">{workspaceName}</span>
        </a>
        {#if (projects.current ?? []).length > 1}
          <label class="mt-3 grid gap-1 px-1 text-xs text-muted-foreground">
            Project
            <Select
              aria-label="Project"
              items={(projects.current ?? []).map((p) => ({ value: p.id, label: p.name }))}
              value={currentProject.id}
              onValueChange={(id) => currentProject.set(id)}
            />
          </label>
        {/if}
      {/snippet}
      {#snippet footer()}
        {#if principal.current}
          <!-- Bottom margin keeps the card clear of the fixed "Prototype" badge. -->
          <div class="mb-8 flex items-center gap-3 rounded-lg border border-sidebar-border bg-surface p-3">
            <Avatar name={principal.current.persona.name} {...avatarImage(principal.current.persona.avatar)} size="sm" />
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
