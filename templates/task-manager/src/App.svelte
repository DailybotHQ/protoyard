<script lang="ts">
import { CheckSquare, LayoutDashboard, ListTodo } from '@lucide/svelte';
import {
  can,
  createRouter,
  Link,
  liveQuery,
  Router,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import { AppShell, Avatar, Badge, Header } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import { CAPABILITIES, ROLE_LABELS } from './domain/policy.ts';
import { PROJECT_COLOR_CLASSES } from './domain/tasks.ts';
import { provideWorkspace } from './lib/context.svelte.ts';
import Board from './screens/Board.svelte';
import MyTasks from './screens/MyTasks.svelte';
import Overview from './screens/Overview.svelte';
import TaskDetail from './screens/TaskDetail.svelte';

const workspace = provideWorkspace();
const principal = usePrincipal();

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
const readOnly = $derived(principal.current ? !can(CAPABILITIES.tasksUpdate) : false);
const navClass =
  'flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring';
</script>

<AppShell sidebarLabel="Main navigation">
  {#snippet sidebar()}
    <div class="flex h-full w-full flex-col gap-6 border-sidebar-border bg-sidebar p-4 text-sidebar-foreground lg:w-64 lg:border-r lg:pb-12">
      <a href="#/" class="flex items-center gap-2.5 rounded-md px-2 pt-1">
        <span class="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm" aria-hidden="true">
          <CheckSquare class="size-4" />
        </span>
        <span class="min-w-0 leading-tight">
          <span class="block text-sm font-semibold text-sidebar-foreground">Tasks</span>
          <span class="block truncate text-xs text-muted-foreground">{principal.current?.organization?.name ?? 'Workspace'}</span>
        </span>
      </a>

      <nav aria-label="Sections" class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
        <ul class="flex flex-col gap-0.5">
          <li>
            <Link href="/" {router} exact class={navClass} activeClass="bg-primary/10 !text-primary">
              <LayoutDashboard class="size-4 shrink-0" aria-hidden="true" />Overview
            </Link>
          </li>
          <li>
            <Link href="/my-tasks" {router} class={navClass} activeClass="bg-primary/10 !text-primary">
              <ListTodo class="size-4 shrink-0" aria-hidden="true" />My tasks
            </Link>
          </li>
        </ul>
        <div>
          <h2 class="px-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Projects</h2>
          <ul class="mt-2 flex flex-col gap-0.5">
            {#each projects.current ?? [] as project (project.id)}
              <li>
                <Link href={`/projects/${project.id}`} {router} class={navClass} activeClass="bg-primary/10 !text-primary">
                  <span class={['size-2.5 shrink-0 rounded-full', PROJECT_COLOR_CLASSES[project.color].dot]} aria-hidden="true"></span>
                  <span class="truncate">{project.name}</span>
                </Link>
              </li>
            {:else}
              <li class="px-2.5 py-1 text-xs text-muted-foreground">No projects yet</li>
            {/each}
          </ul>
        </div>
      </nav>

      {#if principal.current}
        <div class="rounded-lg border border-sidebar-border bg-surface p-3">
          <div class="flex items-center gap-3">
            <Avatar name={principal.current.persona.name} size="sm" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{principal.current.persona.name}</p>
              <p class="truncate text-xs text-muted-foreground">
                {ROLE_LABELS[principal.current.role ?? ''] ?? principal.current.role}
              </p>
            </div>
            {#if readOnly}<Badge variant="secondary">Read-only</Badge>{/if}
          </div>
        </div>
      {/if}
    </div>
  {/snippet}

  {#snippet header()}
    <Header class="lg:hidden" title={principal.current?.organization?.name ?? 'Tasks'} />
  {/snippet}

  <div class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <Router {router} />
  </div>
</AppShell>
