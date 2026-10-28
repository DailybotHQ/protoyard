<script lang="ts">
import { Avatar, Badge, Button, Kanban, type KanbanColumn } from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { sampleFace } from './faces.ts';

interface Task {
  id: string;
  title: string;
  status: string;
  assignee: string;
  blocked?: boolean;
}

const columns: KanbanColumn[] = [
  { id: 'kd-todo', title: 'To do' },
  { id: 'kd-doing', title: 'In progress', description: 'Limit: 3' },
  { id: 'kd-done', title: 'Done' },
];

let tasks = $state<Task[]>([
  { id: 'k1', title: 'Draft onboarding emails', status: 'kd-todo', assignee: 'Ana Lee' },
  { id: 'k2', title: 'Fix CSV export encoding', status: 'kd-doing', assignee: 'Omar Diaz' },
  {
    id: 'k3',
    title: 'Legal review of terms',
    status: 'kd-doing',
    assignee: 'Priya Shah',
    blocked: true,
  },
  { id: 'k4', title: 'Pricing page copy', status: 'kd-done', assignee: 'Lena Novak' },
]);
let counter = $state(5);

function add(columnId: string): void {
  tasks.push({
    id: `k${counter}`,
    title: `New task ${counter}`,
    status: columnId,
    assignee: 'Kai Moreno',
  });
  counter += 1;
}
</script>

<Kanban
  {columns}
  items={tasks}
  label="Sprint board"
  getColumn={(task) => task.status}
  getItemId={(task) => task.id}
  getItemLabel={(task) => task.title}
  canMove={(task, to) => !(task.blocked && to === 'kd-done')}
  onMove={(task, to) => {
    const target = tasks.find((candidate) => candidate.id === task.id);
    if (target) target.status = to;
  }}
  emptyColumnText="Drop tasks here"
>
  {#snippet card(task)}
    <div class="grid gap-2">
      <p class="font-medium">{task.title}</p>
      <div class="flex items-center justify-between gap-2">
        <Avatar name={task.assignee} {...sampleFace(task.assignee)} size="xs" />
        {#if task.blocked}<Badge variant="warning">Blocked</Badge>{/if}
      </div>
    </div>
  {/snippet}
  {#snippet columnFooter(column)}
    <Button size="sm" variant="ghost" class="w-full" onclick={() => add(column.id)}>
      <Icon icon="plus" aria-hidden="true" /> Add to {column.title}
    </Button>
  {/snippet}
</Kanban>
<p class="mt-2 text-xs text-muted-foreground">
  Drag cards, or use the move button on each card (keyboard friendly). Blocked tasks can’t move to
  Done.
</p>
