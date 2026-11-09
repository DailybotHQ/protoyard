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
import { Avatar, Button, Checkbox, EmptyState, ErrorState, Select, Skeleton } from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Heading, Text } from 'texuli/typography';
import DueBadge from '../components/DueBadge.svelte';
import PageHeader from '../components/PageHeader.svelte';
import PriorityBadge from '../components/PriorityBadge.svelte';
import TaskDialog from '../components/TaskDialog.svelte';
import type { Project, Task } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import {
  type DueState,
  dueState,
  PROJECT_COLOR_TONES,
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
    {#each [0, 1, 2, 3] as i (i)}<Skeleton class="h-14 w-full" />{/each}
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
        <Heading level={2} size="sm" id={`group-${group.id}`} class="mb-2">
          <Text as="span" size="sm" weight="semibold" tone={group.id === 'overdue' ? 'destructive' : 'default'}>{group.title}</Text> <Text as="span" size="sm" tone="muted" tabular>{group.tasks.length}</Text>
        </Heading>
        <Box surface="default" border="default" radius="xl" padding="none" class="overflow-hidden">
        <ul>
          {#each group.tasks as task, index (task.id)}
            {@const project = projects.current?.get(task.projectId)}
            <li>
              <Box border={index > 0 ? 'block-start' : 'none'} radius="none" padding="none" class="flex items-center gap-3 px-3 py-2.5 sm:px-4">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="min-h-touch min-w-11 shrink-0 sm:min-h-0 sm:min-w-0"
                aria-label={task.status === 'done' ? `Reopen ${task.title}` : `Mark ${task.title} as done`}
                aria-pressed={task.status === 'done'}
                onclick={() => toggleDone(task)}
              >
                {#if task.status === 'done'}
                  <LucideIcon icon={CircleCheck} size="md" tone="success" />
                {:else}
                  <LucideIcon icon={Circle} size="md" tone="neutral" />
                {/if}
              </Button>
              <div class="min-w-0 flex-1">
                <Link href={`/tasks/${task.id}`} class="block min-w-0">
                  <Text as="span" size="sm" weight="medium" tone={task.status === 'done' ? 'muted' : 'default'} truncate class="block">{task.title}</Text>
                </Link>
                <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  {#if project}
                    <span class="inline-flex items-center gap-1.5">
                      <Avatar name={project.name} tone={PROJECT_COLOR_TONES[project.color]} shape="square" size="xs" decorative />
                      <Text as="span" size="xs" tone="muted" mono>{taskKey(task, project)}</Text>
                    </span>
                  {/if}
                  <Text as="span" size="xs" tone="muted">{STATUS_LABELS[task.status]}</Text>
                </div>
              </div>
              <div class="hidden items-center gap-2 sm:flex">
                <PriorityBadge priority={task.priority} />
              </div>
              <DueBadge {task} />
              </Box>
            </li>
          {/each}
        </ul>
        </Box>
      </section>
    {/each}
  </div>
{/if}

<TaskDialog bind:open={createOpen} projectId={projectFilter || ([...(projects.current?.keys() ?? [])][0] ?? '')} openAfterCreate />
