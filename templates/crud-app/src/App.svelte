<script lang="ts">
import { CheckSquare, FolderKanban, LayoutDashboard, Users } from '@lucide/svelte';
import { avatarImage, createRouter, Router, usePrincipal } from '@protoyard/renderer-svelte';
import { AppShell, Avatar, Badge, Header, Sidebar } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import AppSearch from './components/AppSearch.svelte';
import NotificationsBell from './components/NotificationsBell.svelte';
import { provideCrudApp } from './lib/context.ts';
import Home from './screens/Home.svelte';
import Members from './screens/Members.svelte';
import ProjectsPage from './screens/ProjectsPage.svelte';
import TasksPage from './screens/TasksPage.svelte';

const { runtime } = provideCrudApp();
const principal = usePrincipal();

const router = createRouter(
  [
    { path: '/', component: Home, title: 'Home' },
    { path: '/projects', component: ProjectsPage, title: 'Projects' },
    { path: '/projects/:id', component: ProjectsPage, title: 'Project' },
    { path: '/tasks', component: TasksPage, title: 'Tasks' },
    { path: '/tasks/:id', component: TasksPage, title: 'Task' },
    { path: '/members', component: Members, title: 'Members' },
  ],
  { titleSuffix: runtime.manifest.name }
);
onDestroy(() => router.destroy());

const nav = $derived([
  { href: '#/', label: 'Home', icon: LayoutDashboard, active: router.isActive('/', true) },
  {
    href: '#/projects',
    label: 'Projects',
    icon: FolderKanban,
    active: router.isActive('/projects'),
  },
  { href: '#/tasks', label: 'Tasks', icon: CheckSquare, active: router.isActive('/tasks') },
  { href: '#/members', label: 'Members', icon: Users, active: router.isActive('/members') },
]);
</script>

<AppShell sidebarLabel="Main navigation">
  {#snippet sidebar()}
    <Sidebar items={nav} label="Sections" collapsible={false}>
      {#snippet header()}
        <a href="#/" class="flex min-w-0 items-center gap-2.5 rounded-md px-1">
          <span
            class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm"
            aria-hidden="true"
          >
            <FolderKanban class="size-4" />
          </span>
          <span class="truncate text-sm font-semibold">{runtime.manifest.name}</span>
        </a>
      {/snippet}
      {#snippet footer()}
        {#if principal.current}
          <div
            class="mb-8 flex items-center gap-3 rounded-lg border border-sidebar-border bg-surface p-3"
          >
            <Avatar name={principal.current.persona.name} {...avatarImage(principal.current.persona.avatar)} size="sm" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{principal.current.persona.name}</p>
              <p class="truncate text-xs text-muted-foreground">
                {principal.current.persona.title ?? ''}
              </p>
            </div>
            <Badge variant={principal.current.role === 'viewer' ? 'outline' : 'secondary'}>
              {principal.current.role}
            </Badge>
          </div>
        {/if}
      {/snippet}
    </Sidebar>
  {/snippet}

  {#snippet header()}
    <Header class="border-b border-border" title={runtime.manifest.name}>
      {#snippet actions()}
        <div class="flex items-center gap-2">
          <AppSearch />
          <NotificationsBell />
        </div>
      {/snippet}
    </Header>
  {/snippet}

  <div class="mx-auto w-full max-w-7xl px-4 py-6 pb-safe sm:px-6 lg:px-8">
    <Router {router} />
  </div>
</AppShell>
