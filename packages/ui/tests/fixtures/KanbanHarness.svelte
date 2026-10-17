<script lang="ts">
import Kanban from '../../src/components/kanban/Kanban.svelte';

interface Task {
  id: string;
  title: string;
  status: string;
}

let { onMoved }: { onMoved?: (id: string, to: string) => void } = $props();

let tasks = $state<Task[]>([
  { id: 't1', title: 'Write brief', status: 'todo' },
  { id: 't2', title: 'Ship kit', status: 'doing' },
]);
</script>

<Kanban
  columns={[
    { id: 'todo', title: 'To do' },
    { id: 'doing', title: 'In progress' },
    { id: 'done', title: 'Done' },
  ]}
  items={tasks}
  getColumn={(task) => task.status}
  getItemId={(task) => task.id}
  getItemLabel={(task) => task.title}
  onMove={(task, to) => {
    tasks = tasks.map((t) => (t.id === task.id ? { ...t, status: to } : t));
    onMoved?.(task.id, to);
  }}
>
  {#snippet card(task)}<span>{task.title}</span>{/snippet}
</Kanban>
