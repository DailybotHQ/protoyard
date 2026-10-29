<script lang="ts">
import Kanban from '../../src/components/kanban/Kanban.svelte';
import type { KanbanColumn } from '../../src/components/kanban/types.ts';

interface Task {
  id: string;
  title: string;
  status: string;
}

let {
  onMoved,
  fail = false,
  withFooter = false,
  headingLevel,
}: {
  onMoved?: (id: string, to: string) => void;
  /** The host rejects every move (a service error). */
  fail?: boolean;
  withFooter?: boolean;
  headingLevel?: 2 | 3 | 4;
} = $props();

let tasks = $state<Task[]>([
  { id: 't1', title: 'Write brief', status: 'todo' },
  { id: 't2', title: 'Ship kit', status: 'doing' },
  { id: 't3', title: 'Plan sprint', status: 'todo' },
]);
</script>

<Kanban
  columns={[
    { id: 'todo', title: 'To do' },
    { id: 'doing', title: 'In progress', description: 'Limit: 3' },
    { id: 'done', title: 'Done' },
  ]}
  items={tasks}
  getColumn={(task) => task.status}
  getItemId={(task) => task.id}
  getItemLabel={(task) => task.title}
  canMove={(task, to) => !(task.id === 't3' && to === 'done')}
  onMove={async (task, to) => {
    await Promise.resolve();
    if (fail) throw new Error('Storage is full');
    tasks = tasks.map((t) => (t.id === task.id ? { ...t, status: to } : t));
    onMoved?.(task.id, to);
  }}
  columnFooter={withFooter ? footer : undefined}
  {headingLevel}
>
  {#snippet card(task)}<span>{task.title}</span>{/snippet}
</Kanban>

{#snippet footer(column: KanbanColumn)}
  <span data-testid="footer-{column.id}">Add to {column.title}</span>
{/snippet}
