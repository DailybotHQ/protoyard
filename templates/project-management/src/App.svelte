<script lang="ts">
import {
  avatarImage,
  createRouter,
  liveQuery,
  Router,
  useAppearance,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import { LayoutHost, type NavModel } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import { ROLE_LABELS } from './domain/policy.ts';
import { provideWorkspace } from './lib/context.svelte.ts';

const workspace = provideWorkspace();
const principal = usePrincipal();
const appearance = useAppearance();

/**
 * Hash routes work on refresh and back/forward on any static host. Every
 * screen is its own chunk, so the shell stays small (initial JS budget).
 */
const router = createRouter(
  [
    { path: '/', load: () => import('./screens/Overview.svelte'), title: 'Overview' },
    { path: '/my-tasks', load: () => import('./screens/MyTasks.svelte'), title: 'My tasks' },
    { path: '/projects/:id', load: () => import('./screens/Board.svelte'), title: 'Board' },
    { path: '/timeline', load: () => import('./screens/Timeline.svelte'), title: 'Timeline' },
    { path: '/workload', load: () => import('./screens/Workload.svelte'), title: 'Workload' },
    { path: '/tasks/:id', load: () => import('./screens/TaskDetail.svelte'), title: 'Task' },
  ],
  { titleSuffix: workspace.runtime.manifest.name }
);
onDestroy(() => router.destroy());

const projects = liveQuery(() => workspace.db.projects.orderBy('createdAt').toArray(), {
  initial: [],
});
const layoutNav = $derived({
  brand: {
    label: principal.current?.organization?.name ?? 'Tasks',
    href: '#/',
    icon: 'check-square',
  },
  sections: [
    {
      id: 'workspace',
      items: [
        { id: 'overview', label: 'Overview', href: '#/', icon: 'layout-dashboard', exact: true },
        { id: 'my-tasks', label: 'My tasks', href: '#/my-tasks', icon: 'list-todo' },
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
    <Router {router} />
  </div>
</LayoutHost>
