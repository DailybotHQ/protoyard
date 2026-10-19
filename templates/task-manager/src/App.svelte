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
import Board from './screens/Board.svelte';
import MyTasks from './screens/MyTasks.svelte';
import Overview from './screens/Overview.svelte';
import TaskDetail from './screens/TaskDetail.svelte';

const workspace = provideWorkspace();
const principal = usePrincipal();
const appearance = useAppearance();

/** Hash routes work on refresh and back/forward on any static host. */
const router = createRouter(
  [
    { path: '/', component: Overview, title: 'Overview' },
    { path: '/my-tasks', component: MyTasks, title: 'My tasks' },
    { path: '/projects/:id', component: Board, title: 'Board' },
    { path: '/tasks/:id', component: TaskDetail, title: 'Task' },
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
          image: avatarImage(principal.current.persona.avatar),
          name: principal.current.persona.name,
          detail: ROLE_LABELS[principal.current.role ?? ''] ?? principal.current.role ?? '',
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
