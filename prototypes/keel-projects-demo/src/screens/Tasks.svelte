<script lang="ts">
import { liveQuery, usePrincipal } from '@protoyard/renderer-svelte';
import {
  type SavedView as GridSavedView,
  type GridValue,
  SavedViewSchema,
} from '@protoyard/views/grid';
import { DataGrid, type DataGridColumn } from '@protoyard/views-ui/grid';
import PageHeader from '../components/PageHeader.svelte';
import type { Project, SavedView, Task } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { PRIORITY_LABELS, STATUS_LABELS } from '../domain/tasks.ts';
import { useWorkspace } from '../lib/context.svelte.ts';
import { EDITABLE_GRID_KEYS, type EditableGridKey, TASK_GRID_COLUMNS } from '../lib/task-grid.ts';

/**
 * Every task in one virtualized grid (10,004 in the massive scenario): sort,
 * filter, group, density and named views saved per person through services.
 */
const workspace = useWorkspace();
const principal = usePrincipal();
const tasks = liveQuery(() => workspace.db.tasks.toArray(), { initial: [] as Task[] });
const projects = liveQuery(() => workspace.db.projects.toArray(), { initial: [] as Project[] });
const personaId = () => principal.current?.persona.id ?? '';
const stored = liveQuery(
  () => workspace.db.savedViews.where('personaId').equals(personaId()).sortBy('createdAt'),
  { initial: [] as SavedView[], deps: personaId }
);

const projectById = $derived(new Map((projects.current ?? []).map((p) => [p.id, p])));
const canEdit = $derived(
  Boolean(principal.current) && workspace.runtime.session.can(CAPABILITIES.tasksUpdate)
);
const canSaveViews = $derived(
  Boolean(principal.current) && workspace.runtime.session.can(CAPABILITIES.viewsManage)
);

const accessors: Record<string, (task: Task) => GridValue> = {
  key: (task) => `${projectById.get(task.projectId)?.key ?? '?'}-${task.number}`,
  title: (task) => task.title,
  project: (task) => projectById.get(task.projectId)?.name ?? '',
  status: (task) => task.status,
  priority: (task) => task.priority,
  assignee: (task) =>
    task.assigneeId ? (workspace.peopleById.get(task.assigneeId)?.name ?? '') : '',
  due: (task) => task.dueDate,
  estimate: (task) => task.estimateHours,
};
/** Readable labels for enum cells; filters and saved views keep the stable values. */
const formats: Record<string, (value: GridValue) => string> = {
  status: (value) => STATUS_LABELS[value as Task['status']] ?? String(value ?? ''),
  priority: (value) => PRIORITY_LABELS[value as Task['priority']] ?? String(value ?? ''),
};
const columns = $derived<DataGridColumn<Task>[]>(
  TASK_GRID_COLUMNS.map((column) => ({
    ...column,
    accessor: accessors[column.key],
    ...(formats[column.key] ? { format: formats[column.key] } : {}),
    editable: canEdit && (EDITABLE_GRID_KEYS as readonly string[]).includes(column.key),
  }))
);
const query = $derived({ ...tasks, current: tasks.current });

/** Stored rows → the grid's SavedView shape (a corrupt row is skipped, never thrown). */
const savedViews = $derived(
  (stored.current ?? []).flatMap((row): GridSavedView[] => {
    try {
      return [SavedViewSchema.parse({ id: row.id, name: row.name, ...JSON.parse(row.state) })];
    } catch {
      return [];
    }
  })
);
let activeViewId = $state<string | null>(null);
const views = workspace.services.savedViews;
</script>

<PageHeader
  title="All tasks"
  description={`${(tasks.current?.length ?? 0).toLocaleString('en')} tasks across every project. Sort, filter and group, then save the view.`}
/>
<div data-py-anchor="task-grid">
<DataGrid
  {query}
  {columns}
  getRowId={(task: Task) => task.id}
  label="All tasks"
  class="grid-cols-[minmax(0,1fr)]"
  height="min(36rem, 70vh)"
  {savedViews}
  bind:activeViewId
  aggregates={[{ key: 'estimate', fn: 'sum' }]}
  onRowOpen={(task: Task) => { window.location.hash = `#/tasks/${task.id}`; }}
  {...(canSaveViews
    ? {
        onCreateView: (name: string, view: unknown) => views.create(name, view),
        onRenameView: (view: GridSavedView, name: string) => views.rename(view.id, name),
        onDeleteView: (view: GridSavedView) => views.remove(view.id),
      }
    : {})}
  {...(canEdit
    ? {
        onCommit: (task: Task, key: string, value: GridValue) =>
          workspace.services.tasks.setField(task.id, key as EditableGridKey, value),
      }
    : {})}
/>
</div>
