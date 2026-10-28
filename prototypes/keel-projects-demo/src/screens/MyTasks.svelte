<script lang="ts">
import { Circle, CircleCheck, ListTodo } from '@lucide/svelte';
import {
  can,
  Link,
  liveQuery,
  runService,
  useClock,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import { Button, Checkbox, EmptyState, ErrorState, Select, Skeleton } from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import DueBadge from '../components/DueBadge.svelte';
import PageHeader from '../components/PageHeader.svelte';
import PriorityBadge from '../components/PriorityBadge.svelte';
import TaskDialog from '../components/TaskDialog.svelte';
import type { Project, Task } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import {
  type DueState,
  dueState,
  PROJECT_COLOR_CLASSES,
  STATUS_LABELS,
  sortByDue,
  taskKey,
} from '../domain/tasks.ts';
import { useWorkspace } from '../lib/context.svelte.ts';

const { db, services } = useWorkspace();
const clock = useClock();
const principal = usePrincipal();

const me = $derived(principal.current?.persona.id ?? '');
const mine = liveQuery(() => db.tasks.where('assigneeId').equals(me).toArray(), {
  initial: [],
  deps: () => me,
});
const projects = liveQuery(
  async () => new Map((await db.projects.toArray()).map((p) => [p.id, p])),
  { initial: new Map<string, Project>() }
);

let projectFilter = $state('');
let showDone = $state(false);
let createOpen = $state(false);

const GROUPS: { id: DueState; title: string }[] = [
  { id: 'overdue', title: 'Overdue' },
  { id: 'today', title: 'Due today' },
  { id: 'soon', title: 'Next 7 days' },
  { id: 'later', title: 'Later' },
  { id: 'none', title: 'No due date' },
  { id: 'done', title: 'Completed' },
];

const groups = $derived.by(() => {
  const now = clock.now;
  const tasks = sortByDue(
    (mine.current ?? []).filter((t) => !projectFilter || t.projectId === projectFilter)
  );
  return GROUPS.filter((g) => showDone || g.id !== 'done')
    .map((group) => ({ ...group, tasks: tasks.filter((t) => dueState(t, now) === group.id) }))
    .filter((group) => group.tasks.length > 0);
});
const openCount = $derived((mine.current ?? []).filter((t) => t.status !== 'done').length);
const overdueCount = $derived(
  (mine.current ?? []).filter((t) => dueState(t, clock.now) === 'overdue').length
);
const canWork = $derived(can(CAPABILITIES.tasksUpdate));

async function toggleDone(task: Task) {
  const next = task.status === 'done' ? 'todo' : 'done';
  await runService(() => services.tasks.move(task.id, next), {
    success: next === 'done' ? 'Marked as done' : 'Reopened',
  });
}
</script>

<PageHeader
  title="My tasks"
  description={canWork
    ? `${openCount} open${overdueCount ? ` · ${overdueCount} overdue` : ''} — sorted by due date`
    : 'Tasks assigned to you'}
>
  {#snippet actions()}
    {#if can(CAPABILITIES.tasksCreate)}
      <Button onclick={() => (createOpen = true)} disabled={!projects.loading && (projects.current?.size ?? 0) === 0}>
        <Icon icon="plus" class="size-4" aria-hidden="true" />New task
      </Button>
    {/if}
  {/snippet}
</PageHeader>

{#if canWork}
  <div class="mb-5 flex flex-wrap items-center gap-3">
    <Select
      aria-label="Filter by project"
      class="w-full sm:w-56"
      items={[
        { value: '', label: 'All projects' },
        ...[...(projects.current?.values() ?? [])].map((p) => ({ value: p.id, label: p.name })),
      ]}
      bind:value={projectFilter}
    />
    <Checkbox label="Show completed" bind:checked={showDone} />
  </div>
{/if}

{#if mine.loading}
  <div class="space-y-2" aria-busy="true" aria-label="Loading tasks">
    {#each [0, 1, 2, 3] as i (i)}<Skeleton class="h-14 w-full rounded-lg" />{/each}
  </div>
{:else if mine.error}
  <ErrorState title="Could not load your tasks" message={String(mine.error)} />
{:else if !canWork}
  <EmptyState
    icon={ListTodo}
    title="Viewers are not assigned tasks"
    description="You can browse every project board. Switch to a member persona in DevTools to see a personal task list."
  >
    {#snippet action()}<Button href="#/" variant="outline">Browse projects</Button>{/snippet}
  </EmptyState>
{:else if groups.length === 0}
  <EmptyState
    icon={ListTodo}
    title={(mine.current?.length ?? 0) === 0 ? 'Nothing assigned to you' : 'All caught up'}
    description={(mine.current?.length ?? 0) === 0
      ? 'Tasks assigned to you show up here, grouped by due date.'
      : 'No open tasks match. Tick “Show completed” to see finished work.'}
  />
{:else}
  <div class="space-y-8">
    {#each groups as group (group.id)}
      <section aria-labelledby={`group-${group.id}`}>
        <h2 id={`group-${group.id}`} class={['mb-2 text-sm font-semibold', group.id === 'overdue' && 'text-destructive']}>
          {group.title} <span class="font-normal text-muted-foreground">{group.tasks.length}</span>
        </h2>
        <ul class="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {#each group.tasks as task (task.id)}
            {@const project = projects.current?.get(task.projectId)}
            <li class="flex items-center gap-3 px-3 py-2.5 sm:px-4">
              <Button
                type="button"
                class="inline-flex size-9 min-h-touch min-w-[44px] shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-success focus-visible:outline-2 focus-visible:outline-ring sm:min-h-0 sm:min-w-0"
                aria-label={task.status === 'done' ? `Reopen ${task.title}` : `Mark ${task.title} as done`}
                aria-pressed={task.status === 'done'}
                onclick={() => toggleDone(task)}
              >
                {#if task.status === 'done'}
                  <LucideIcon icon={CircleCheck} class="size-5 text-success" />
                {:else}
                  <LucideIcon icon={Circle} class="size-5" />
                {/if}
              </Button>
              <div class="min-w-0 flex-1">
                <Link href={`/tasks/${task.id}`} class={['block truncate text-sm font-medium hover:text-primary', task.status === 'done' && 'text-muted-foreground line-through']}>
                  {task.title}
                </Link>
                <p class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  {#if project}
                    <span class="inline-flex items-center gap-1.5">
                      <span class={['size-2 rounded-full', PROJECT_COLOR_CLASSES[project.color].dot]} aria-hidden="true"></span>
                      <span class="font-mono">{taskKey(task, project)}</span>
                    </span>
                  {/if}
                  <span>{STATUS_LABELS[task.status]}</span>
                </p>
              </div>
              <div class="hidden items-center gap-2 sm:flex">
                <PriorityBadge priority={task.priority} />
              </div>
              <DueBadge {task} />
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>
{/if}

<TaskDialog bind:open={createOpen} projectId={projectFilter || ([...(projects.current?.keys() ?? [])][0] ?? '')} openAfterCreate />
