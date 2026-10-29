<script lang="ts">
import { liveQuery, type RouteProps, usePrincipal } from '@protoyard/renderer-svelte';
import { Button } from '@protoyard/ui';
import { BoardView } from '@protoyard/views-ui/board';
import PageHeader from '../components/PageHeader.svelte';
import TaskCard from '../components/TaskCard.svelte';
import { TASK_PRIORITIES, type Task } from '../database/schema.ts';
import { type LaneMode, UNASSIGNED_LANE } from '../domain/services.ts';
import { PRIORITY_LABELS, STATUS_LABELS } from '../domain/tasks.ts';
import { useWorkspace } from '../lib/context.svelte.ts';

let { params }: RouteProps = $props();
const workspace = useWorkspace();
const principal = usePrincipal();
const projectId = () => params.id ?? '';
const project = liveQuery(() => workspace.db.projects.get(projectId()), { deps: projectId });
const query = liveQuery(() => workspace.db.tasks.where('projectId').equals(projectId()).toArray(), {
  initial: [],
  deps: projectId,
});
const columns = [
  { id: 'todo', title: STATUS_LABELS.todo },
  { id: 'in-progress', title: STATUS_LABELS['in-progress'], wip: { soft: 6 } },
  { id: 'review', title: STATUS_LABELS.review, wip: { soft: 4 } },
  { id: 'done', title: STATUS_LABELS.done },
];
/** Swimlanes: none, one per teammate (plus "Unassigned"), or one per priority. */
let laneMode = $state<LaneMode | null>(null);
const lanes = $derived(
  laneMode === 'assignee'
    ? [
        ...workspace.assignable.map((person) => ({ id: person.id, title: person.name })),
        { id: UNASSIGNED_LANE, title: 'Unassigned' },
      ]
    : laneMode === 'priority'
      ? [...TASK_PRIORITIES]
          .reverse()
          .map((priority) => ({ id: priority, title: PRIORITY_LABELS[priority] }))
      : undefined
);
const laneOf = (task: Task) =>
  laneMode === 'assignee'
    ? (task.assigneeId ?? UNASSIGNED_LANE)
    : laneMode === 'priority'
      ? task.priority
      : '';
const canEdit = $derived(Boolean(principal.current && principal.current.role !== 'viewer'));
const LANE_OPTIONS: { value: LaneMode | null; label: string }[] = [
  { value: null, label: 'No lanes' },
  { value: 'assignee', label: 'By assignee' },
  { value: 'priority', label: 'By priority' },
];
</script>

{#if project.current}
  <PageHeader title={project.current.name} description={`${project.current.key} · ${query.current?.length ?? 0} tasks`}>
    {#snippet actions()}
      <div role="group" aria-label="Swimlanes" data-py-anchor="board-lanes" class="inline-flex rounded-lg border border-border bg-surface p-0.5">
        {#each LANE_OPTIONS as option (option.label)}
          <Button
            type="button"
            variant="ghost"
            class="rounded-md px-3 py-1.5 text-sm text-surface-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm"
            aria-pressed={laneMode === option.value}
            onclick={() => (laneMode = option.value)}
          >
            {option.label}
          </Button>
        {/each}
      </div>
    {/snippet}
  </PageHeader>
  <!-- Review comments pin to stable anchors (data-py-anchor) that survive layout and data changes. -->
  <div data-py-anchor="board">
  {#key laneMode}
    <BoardView
      {query}
      {columns}
      {...(lanes ? { lanes } : {})}
      label={`${project.current.name} board`}
      getId={(task: Task) => task.id}
      getColumn={(task: Task) => task.status}
      getLane={laneOf}
      getRank={(task: Task) => String(task.order).padStart(8, '0')}
      getLabel={(task: Task) => task.title}
      canMove={() => canEdit || 'This persona has read-only access.'}
      onMove={(move) => workspace.services.tasks.reorder(move, laneMode)}
      onOpen={(task) => { window.location.hash = `#/tasks/${task.id}`; }}
      emptyColumnText="No tasks in this column"
    >
      {#snippet card(task: Task)}
        <TaskCard {task} project={project.current} />
      {/snippet}
    </BoardView>
  {/key}
  </div>
{:else}
  <PageHeader title="Project board" description="Choose a project from navigation." />
{/if}
