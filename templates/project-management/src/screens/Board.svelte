<script lang="ts">
import { liveQuery, type RouteProps, usePrincipal } from '@protoyard/renderer-svelte';
import { BoardView } from '@protoyard/views-ui/board';
import PageHeader from '../components/PageHeader.svelte';
import TaskCard from '../components/TaskCard.svelte';
import type { Task } from '../database/schema.ts';
import { STATUS_LABELS } from '../domain/tasks.ts';
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
  { id: 'in-progress', title: STATUS_LABELS['in-progress'] },
  { id: 'review', title: STATUS_LABELS.review },
  { id: 'done', title: STATUS_LABELS.done },
];
const canEdit = $derived(Boolean(principal.current && principal.current.role !== 'viewer'));
</script>

{#if project.current}
  <PageHeader title={project.current.name} description={`${project.current.key} · ${query.current?.length ?? 0} tasks`} />
  <BoardView
    {query}
    {columns}
    label={`${project.current.name} board`}
    getId={(task: Task) => task.id}
    getColumn={(task: Task) => task.status}
    getRank={(task: Task) => String(task.order).padStart(8, '0')}
    getLabel={(task: Task) => task.title}
    canMove={() => canEdit || 'This persona has read-only access.'}
    onMove={(move) => workspace.services.tasks.reorder(move)}
    onOpen={(task) => { window.location.hash = `#/tasks/${task.id}`; }}
    emptyColumnText="No tasks in this column"
  >
    {#snippet card(task: Task)}
      <TaskCard {task} project={project.current} />
    {/snippet}
  </BoardView>
{:else}
  <PageHeader title="Project board" description="Choose a project from navigation." />
{/if}
