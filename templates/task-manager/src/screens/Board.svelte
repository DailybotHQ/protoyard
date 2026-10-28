<script lang="ts">
import { FolderX, Pencil } from '@lucide/svelte';
import {
  can,
  liveQuery,
  type RouteProps,
  runService,
  useClock,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import {
  Button,
  Checkbox,
  EmptyState,
  ErrorState,
  Input,
  Kanban,
  type KanbanColumn,
  Select,
  Skeleton,
} from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import PageHeader from '../components/PageHeader.svelte';
import ProjectDialog from '../components/ProjectDialog.svelte';
import TaskCard from '../components/TaskCard.svelte';
import TaskDialog from '../components/TaskDialog.svelte';
import {
  TASK_LABELS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type Task,
  type TaskLabel,
  type TaskPriority,
  type TaskStatus,
} from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import {
  filterTasks,
  LABEL_NAMES,
  PRIORITY_LABELS,
  PROJECT_COLOR_CLASSES,
  STATUS_LABELS,
  sortForBoard,
} from '../domain/tasks.ts';
import { useWorkspace } from '../lib/context.svelte.ts';

/**
 * The project board. Cards move by drag-and-drop OR the card's "Move to…"
 * menu (keyboard and screen-reader path). Moves go through `tasks.move`, so
 * the simulated policy decides; viewers get a read-only board.
 */
let { params }: RouteProps = $props();

const workspace = useWorkspace();
const { db, services } = workspace;
const clock = useClock();
const principal = usePrincipal();

const id = () => params.id ?? '';
const project = liveQuery(() => db.projects.get(id()), { deps: id });
const tasks = liveQuery(() => db.tasks.where('projectId').equals(id()).toArray(), {
  initial: [],
  deps: id,
});
const commentCounts = liveQuery(
  async () => {
    const taskIds = await db.tasks.where('projectId').equals(id()).primaryKeys();
    const counts = new Map<string, number>();
    for (const comment of await db.comments.where('taskId').anyOf(taskIds).toArray()) {
      counts.set(comment.taskId, (counts.get(comment.taskId) ?? 0) + 1);
    }
    return counts;
  },
  { initial: new Map<string, number>(), deps: id }
);

let query = $state('');
let assignee = $state('');
let priority = $state<TaskPriority | ''>('');
let label = $state<TaskLabel | ''>('');
let overdueOnly = $state(false);
let createOpen = $state(false);
let createIn = $state<TaskStatus>('todo');
let editProjectOpen = $state(false);

const canEdit = $derived(can(CAPABILITIES.tasksUpdate));
const canCreate = $derived(can(CAPABILITIES.tasksCreate));
const filtering = $derived(Boolean(query || assignee || priority || label || overdueOnly));
const visible = $derived(
  sortForBoard(
    filterTasks(
      tasks.current ?? [],
      {
        query,
        assignee: assignee === 'me' ? (principal.current?.persona.id ?? '') : assignee,
        priority,
        label,
        overdueOnly,
      },
      clock.now
    )
  )
);
const columns: KanbanColumn[] = TASK_STATUSES.map((status) => ({
  id: status,
  title: STATUS_LABELS[status],
}));

function clearFilters() {
  query = '';
  assignee = '';
  priority = '';
  label = '';
  overdueOnly = false;
}

async function move(task: Task, status: string) {
  const result = await runService(() => services.tasks.move(task.id, status as TaskStatus), {
    success: `Moved to ${STATUS_LABELS[status as TaskStatus]}`,
  });
  // Kanban announces failures to screen readers when onMove throws.
  if (!result.ok) throw result.error instanceof Error ? result.error : new Error('Move failed');
}
</script>

{#snippet card(task: Task)}
  <TaskCard {task} project={project.current} comments={commentCounts.current?.get(task.id) ?? 0} />
{/snippet}

{#snippet addToColumn(column: KanbanColumn)}
  <Button
    variant="ghost"
    size="sm"
    class="w-full justify-start text-muted-foreground"
    onclick={() => {
      createIn = column.id as TaskStatus;
      createOpen = true;
    }}
  >
    <Icon icon="plus" class="size-4" aria-hidden="true" />Add task<span class="sr-only"> to {column.title}</span>
  </Button>
{/snippet}

{#if project.loading}
  <Skeleton class="h-10 w-64" />
  <div class="mt-6 flex gap-4">{#each [0, 1, 2, 3] as i (i)}<Skeleton class="h-80 w-72 rounded-xl" />{/each}</div>
{:else if project.error}
  <ErrorState title="Could not load this board" message={String(project.error)} />
{:else if !project.current}
  <EmptyState icon={FolderX} title="Project not found" description="It may have been deleted, or this scenario never had it.">
    {#snippet action()}<Button href="#/">Back to overview</Button>{/snippet}
  </EmptyState>
{:else}
  {@const current = project.current}
  <PageHeader title={current.name} description={current.description || `${current.key} · ${(tasks.current ?? []).length} tasks`}>
    {#snippet actions()}
      <span class={['rounded-md px-2 py-1 font-mono text-xs font-medium', PROJECT_COLOR_CLASSES[current.color].soft]}>{current.key}</span>
      {#if can(CAPABILITIES.projectsManage)}
        <Button variant="outline" onclick={() => (editProjectOpen = true)}><LucideIcon icon={Pencil} class="size-4" />Edit</Button>
      {/if}
      {#if canCreate}
        <Button onclick={() => { createIn = 'todo'; createOpen = true; }}><Icon icon="plus" class="size-4" aria-hidden="true" />New task</Button>
      {/if}
    {/snippet}
  </PageHeader>

  <div class="mb-4 flex flex-wrap items-center gap-2" role="search" aria-label="Filter tasks">
    <div class="relative w-full sm:w-60">
      <Icon icon="search" class="pointer-events-none absolute top-1 2 left-3 size-4 -translate-y-1 2 text-muted-foreground" aria-hidden="true" />
      <Input type="search" class="pl-9" placeholder="Filter tasks…" aria-label="Filter tasks by text" bind:value={query} />
    </div>
    <Select
      aria-label="Filter by assignee"
      class="w-full sm:w-44"
      items={[
        { value: '', label: 'Anyone' },
        { value: 'me', label: 'Assigned to me' },
        { value: 'unassigned', label: 'Unassigned' },
        ...workspace.assignable.map((p) => ({ value: p.id, label: p.name })),
      ]}
      bind:value={assignee}
    />
    <Select
      aria-label="Filter by priority"
      class="w-[calc(50%-0.25rem)] sm:w-36"
      items={[{ value: '', label: 'Any priority' }, ...TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))]}
      bind:value={priority}
    />
    <Select
      aria-label="Filter by label"
      class="w-[calc(50%-0.25rem)] sm:w-36"
      items={[{ value: '', label: 'Any label' }, ...TASK_LABELS.map((l) => ({ value: l, label: LABEL_NAMES[l] }))]}
      bind:value={label}
    />
    <Checkbox label="Overdue only" bind:checked={overdueOnly} />
    {#if filtering}
      <Button variant="link" size="sm" onclick={clearFilters}>Clear filters</Button>
      <p class="w-full text-xs text-muted-foreground sm:ml-auto sm:w-auto" aria-live="polite">
        Showing {visible.length} of {(tasks.current ?? []).length} tasks
      </p>
    {/if}
  </div>

  {#if !canEdit}
    <p class="mb-3 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
      You have read-only access. Switch persona in DevTools (Ctrl/⌘ + .) to move or edit tasks.
    </p>
    <div class="flex gap-4 overflow-x-auto pb-3" role="region" aria-label={`${current.name} board (read-only)`}>
      {#each columns as column (column.id)}
        {@const items = visible.filter((t) => t.status === column.id)}
        <section aria-labelledby={`col-${column.id}`} class="flex w-[85vw] max-w-80 shrink-0 flex-col rounded-xl border border-border bg-muted/40 sm:w-auto sm:min-w-56 sm:flex-1 sm:basis-0">
          <header class="flex items-center justify-between px-3 pt-3 pb-2">
            <h2 id={`col-${column.id}`} class="text-sm font-semibold">{column.title}</h2>
            <span class="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">{items.length}<span class="sr-only"> tasks</span></span>
          </header>
          <ul class="flex min-h-24 flex-col gap-2 px-2 pb-2">
            {#each items as task (task.id)}
              <li class="rounded-lg border border-border bg-surface p-3 shadow-soft">{@render card(task)}</li>
            {:else}
              <li class="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border px-3 py-6 text-xs text-muted-foreground">No tasks</li>
            {/each}
          </ul>
        </section>
      {/each}
    </div>
  {:else}
    <Kanban
      label={`${current.name} board`}
      headingLevel={2}
      {columns}
      items={visible}
      getColumn={(task) => task.status}
      getItemId={(task) => task.id}
      getItemLabel={(task) => task.title}
      canMove={(task) => can(CAPABILITIES.tasksUpdate, task)}
      onMove={move}
      {card}
      columnFooter={canCreate ? addToColumn : undefined}
      emptyColumnText={filtering ? 'No matching tasks' : 'Drop tasks here'}
    />
  {/if}

  <TaskDialog bind:open={createOpen} projectId={current.id} status={createIn} />
  <ProjectDialog bind:open={editProjectOpen} project={current} />
{/if}
