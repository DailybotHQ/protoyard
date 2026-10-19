<script lang="ts">
import { Button } from '@protoyard/ui';
import { BoardView } from '@protoyard/views-ui/board';

type Task = { id: string; title: string; status: string; rank: string; owner: string };
const columns = [
  { id: 'todo', title: 'To do', wip: { soft: 3 } },
  { id: 'doing', title: 'In progress', wip: { soft: 2 } },
  { id: 'done', title: 'Done' },
];
let tasks = $state<Task[]>([
  { id: 'task-1', title: 'Map the onboarding flow', status: 'todo', rank: 'a0', owner: 'Ada' },
  { id: 'task-2', title: 'Review new palette', status: 'doing', rank: 'a0', owner: 'Bruno' },
  { id: 'task-3', title: 'Ship the empty state', status: 'done', rank: 'a0', owner: 'Chiara' },
]);
const query = $derived({ current: tasks, loading: false, error: null });
async function move(change: { columnId: string; rank: string }, item: Task) {
  await Promise.resolve();
  tasks = tasks.map((task) =>
    task.id === item.id ? { ...task, status: change.columnId, rank: change.rank } : task
  );
}
function addTask() {
  tasks = [
    ...tasks,
    {
      id: `task-${tasks.length + 1}`,
      title: 'Try a board action',
      status: 'todo',
      rank: `a${tasks.length}`,
      owner: 'You',
    },
  ];
}
</script>

<div class="space-y-3">
  <Button onclick={addTask} size="sm">Add local task</Button>
  <BoardView {query} {columns} getId={(task) => task.id} getColumn={(task) => task.status} getRank={(task) => task.rank} getLabel={(task) => task.title} onMove={move}>
    {#snippet card(task)}<span class="font-medium">{task.title}</span><span class="block text-xs text-muted-foreground">{task.owner}</span>{/snippet}
  </BoardView>
</div>
