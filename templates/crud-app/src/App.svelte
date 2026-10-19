<script lang="ts">
import { CheckSquare, FolderKanban, LayoutDashboard, Users } from '@lucide/svelte';
import { createRouter, Router, useAppearance, usePrincipal } from '@protoyard/renderer-svelte';
import { LayoutHost, navFromSidebar } from '@protoyard/ui';
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
const appearance = useAppearance();

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
const layoutNav = $derived(
  navFromSidebar(nav, {
    brand: { label: runtime.manifest.name, icon: 'folder-kanban' },
    ...(principal.current
      ? {
          user: {
            name: principal.current.persona.name,
            detail: principal.current.persona.title ?? principal.current.role ?? '',
          },
        }
      : {}),
  })
);
</script>

<LayoutHost layout={appearance.current.layout.value} nav={layoutNav} storageKey={runtime.manifest.storage.namespace}>
  <div class="mx-auto w-full max-w-7xl px-4 py-6 pb-safe sm:px-6 lg:px-8">
    <div class="mb-4 flex justify-end gap-2"><AppSearch /><NotificationsBell /></div>
    <Router {router} />
  </div>
</LayoutHost>
