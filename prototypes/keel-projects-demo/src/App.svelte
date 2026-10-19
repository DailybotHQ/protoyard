<script lang="ts">
import { Search } from '@lucide/svelte';
import {
  avatarImage,
  createRouter,
  liveQuery,
  navigate,
  Router,
  useAppearance,
  useClock,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import { Kbd, LayoutHost, type NavModel } from '@protoyard/ui';
import { createCommands } from '@protoyard/views-ui/commands';
import { onDestroy } from 'svelte';
import { ROLE_LABELS } from './domain/policy.ts';
import { provideWorkspace } from './lib/context.svelte.ts';

const workspace = provideWorkspace();
const principal = usePrincipal();
const appearance = useAppearance();
const clock = useClock();

/**
 * Hash routes work on refresh and back/forward on any static host. Every
 * screen is its own chunk, so the shell stays small (initial JS budget).
 */
const routes = [
  { path: '/', load: () => import('./screens/Overview.svelte'), title: 'Overview' },
  { path: '/my-tasks', load: () => import('./screens/MyTasks.svelte'), title: 'My tasks' },
  { path: '/tasks', load: () => import('./screens/Tasks.svelte'), title: 'All tasks' },
  { path: '/projects/:id', load: () => import('./screens/Board.svelte'), title: 'Board' },
  { path: '/calendar', load: () => import('./screens/Calendar.svelte'), title: 'Calendar' },
  { path: '/timeline', load: () => import('./screens/Timeline.svelte'), title: 'Timeline' },
  { path: '/workload', load: () => import('./screens/Workload.svelte'), title: 'Workload' },
  { path: '/tasks/:id', load: () => import('./screens/TaskDetail.svelte'), title: 'Task' },
];
const router = createRouter(routes, { titleSuffix: workspace.runtime.manifest.name });
onDestroy(() => router.destroy());

const projects = liveQuery(() => workspace.db.projects.orderBy('createdAt').toArray(), {
  initial: [],
});

/** Command palette (⌘K / Ctrl+K): every page, each project board and inbox actions. */
const commands = createCommands(workspace.runtime, [
  { path: '/', name: 'Overview', description: 'Projects, sprint progress and due soon' },
  { path: '/my-tasks', name: 'My tasks', description: 'Work assigned to you' },
  { path: '/tasks', name: 'All tasks', description: 'The task grid with saved views' },
  { path: '/calendar', name: 'Calendar', description: 'Standups, planning, review and retro' },
  { path: '/timeline', name: 'Timeline', description: 'Gantt, dependencies and the critical path' },
  { path: '/workload', name: 'Workload', description: 'Assignments by teammate' },
]);
onDestroy(() => commands.destroy());
commands.register({
  id: 'inbox.read-all',
  label: 'Mark all notifications as read',
  group: 'Inbox',
  keywords: ['notifications', 'mentions', 'inbox'],
  run: () => workspace.services.notifications.markAllRead(),
});
$effect(() => {
  const off = (projects.current ?? []).map((project) =>
    commands.register({
      id: `board.${project.id}`,
      label: `Open the ${project.name} board`,
      group: 'Projects',
      keywords: [project.key, 'board', 'kanban'],
      run: () => navigate(`/projects/${project.id}`),
    })
  );
  return () => {
    for (const unregister of off) unregister();
  };
});

/** This persona's notifications (mentions), newest first; follows persona switches. */
const personaId = () => principal.current?.persona.id ?? '';
const inbox = liveQuery(
  async () =>
    (await workspace.db.notifications.where('personaId').equals(personaId()).toArray()).sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
    ),
  { initial: [], deps: personaId }
);

const layoutNav = $derived({
  brand: {
    label: principal.current?.organization?.name ?? 'Keel Studio',
    href: '#/',
    icon: 'check-square',
  },
  sections: [
    {
      id: 'workspace',
      items: [
        { id: 'overview', label: 'Overview', href: '#/', icon: 'layout-dashboard', exact: true },
        { id: 'my-tasks', label: 'My tasks', href: '#/my-tasks', icon: 'list-todo' },
        { id: 'tasks', label: 'All tasks', href: '#/tasks', icon: 'database', exact: true },
        { id: 'calendar', label: 'Calendar', href: '#/calendar', icon: 'calendar' },
        { id: 'timeline', label: 'Timeline', href: '#/timeline', icon: 'workflow' },
        { id: 'workload', label: 'Workload', href: '#/workload', icon: 'users' },
      ],
    },
    {
      id: 'projects',
      label: 'Projects',
      items: (projects.current ?? []).map((project) => ({
        id: `project-${project.id}`,
        label: project.name,
        href: `#/projects/${project.id}`,
        icon: 'folder-kanban',
      })),
    },
  ],
  ...(principal.current
    ? {
        user: {
          name: principal.current.persona.name,
          detail: ROLE_LABELS[principal.current.role ?? ''] ?? principal.current.role ?? '',
          image: avatarImage(principal.current.persona.avatar),
        },
      }
    : {}),
} satisfies NavModel);
</script>

<LayoutHost layout={appearance.current.layout.value} nav={layoutNav} storageKey={workspace.runtime.manifest.storage.namespace}>
  <div class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <div class="mb-4 flex items-center justify-end gap-2" data-keel-toolbar>
      <!-- The palette and the notifications center are their own chunks (the palette's ⌘K works once it loads). -->
      {#await import('@protoyard/views-ui/commands') then { AppCommandPalette }}
      <AppCommandPalette registry={commands} placeholder="Jump to a page, a board or an action…">
        {#snippet trigger({ open, keys })}
          <button
            type="button"
            class="inline-flex h-9 min-w-0 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:w-64"
            onclick={open}
          >
            <Search class="size-4 shrink-0" aria-hidden="true" />
            <span class="truncate">Search or jump to…</span>
            <span class="ml-auto hidden gap-0.5 sm:inline-flex" aria-hidden="true">{#each keys as key (key)}<Kbd>{key}</Kbd>{/each}</span>
          </button>
        {/snippet}
      </AppCommandPalette>
      {/await}
      {#await import('@protoyard/views-ui/notifications') then { NotificationCenter }}
      <NotificationCenter
        query={inbox}
        now={clock.now}
        label="Notifications"
        hrefFor={(item) => `/tasks/${item.subjectId}`}
        onMarkRead={(id) => workspace.services.notifications.markRead(id)}
        onMarkAllRead={() => workspace.services.notifications.markAllRead()}
      />
      {/await}
    </div>
    <Router {router} />
  </div>
</LayoutHost>
