<script lang="ts">
import {
  AlertDialog,
  Avatar,
  Badge,
  type BadgeVariant,
  Button,
  DetailPanel,
  Dialog,
  FormField,
  Input,
  Kanban,
  type KanbanColumn,
  Select,
  Textarea,
  toast,
  UserPicker,
} from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { sampleFace } from './faces.ts';
import { PEOPLE } from './members.ts';

type Priority = 'low' | 'medium' | 'high';
interface Task {
  id: string;
  title: string;
  notes: string;
  column: string;
  priority: Priority;
  assignee: string;
}

const columns: KanbanColumn[] = [
  { id: 'pk-backlog', title: 'Backlog' },
  { id: 'pk-progress', title: 'In progress' },
  { id: 'pk-review', title: 'Review' },
  { id: 'pk-done', title: 'Done' },
];
const priorityTone: Record<Priority, BadgeVariant> = {
  low: 'secondary',
  medium: 'info',
  high: 'warning',
};

let tasks = $state<Task[]>([
  {
    id: 'p1',
    title: 'Audit color contrast',
    notes: 'Check every theme in light and dark.',
    column: 'pk-backlog',
    priority: 'high',
    assignee: 'u-ana',
  },
  {
    id: 'p2',
    title: 'Write release notes',
    notes: '',
    column: 'pk-backlog',
    priority: 'low',
    assignee: 'u-lena',
  },
  {
    id: 'p3',
    title: 'Offline mode for tasks',
    notes: 'Queue writes while offline.',
    column: 'pk-progress',
    priority: 'medium',
    assignee: 'u-omar',
  },
  {
    id: 'p4',
    title: 'Billing webhooks retry',
    notes: 'Exponential backoff, max 5 tries.',
    column: 'pk-review',
    priority: 'high',
    assignee: 'u-kai',
  },
  {
    id: 'p5',
    title: 'Customer interviews',
    notes: '6 of 8 done.',
    column: 'pk-done',
    priority: 'medium',
    assignee: 'u-priya',
  },
]);
let selectedId = $state<string | null>(null);
let panelOpen = $state(false);
let createOpen = $state(false);
let draftTitle = $state('');
let draftTouched = $state(false);
let counter = $state(6);

const selected = $derived(tasks.find((task) => task.id === selectedId));
const nameOf = (id: string): string =>
  PEOPLE.find((person) => person.id === id)?.name ?? 'Unassigned';
const titleError = $derived(
  draftTitle.trim().length < 3 ? 'Use at least 3 characters.' : undefined
);

function open(task: Task): void {
  selectedId = task.id;
  panelOpen = true;
}

function create(event: SubmitEvent): void {
  event.preventDefault();
  draftTouched = true;
  if (titleError) return;
  tasks.push({
    id: `p${counter}`,
    title: draftTitle.trim(),
    notes: '',
    column: 'pk-backlog',
    priority: 'medium',
    assignee: 'u-ana',
  });
  counter += 1;
  createOpen = false;
  toast.success('Task created', { description: draftTitle.trim() });
}

function remove(): void {
  if (!selected) return;
  const title = selected.title;
  tasks = tasks.filter((task) => task.id !== selected.id);
  panelOpen = false;
  toast.success('Task deleted', { description: title });
}
</script>

<div class="relative flex h-[560px] flex-col overflow-hidden rounded-xl border border-border bg-background">
  <div class="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
    <div class="min-w-0">
      <p class="truncate font-heading font-semibold">Sprint 14</p>
      <p class="text-xs text-muted-foreground">{tasks.length} tasks · {tasks.filter((t) => t.column === 'pk-done').length} done</p>
    </div>
    <Dialog
      bind:open={createOpen}
      title="New task"
      size="sm"
      onOpenChange={(isOpen) => {
        if (isOpen) {
          draftTitle = '';
          draftTouched = false;
        }
      }}
    >
      {#snippet trigger({ props })}<Button {...props} size="sm"><Icon icon="plus" aria-hidden="true" /> New task</Button>{/snippet}
      <form id="pattern-kanban-new" class="py-1" novalidate onsubmit={create}>
        <FormField label="Title" required error={draftTouched ? titleError : undefined}>
          {#snippet children({ props })}<Input {...props} bind:value={draftTitle} />{/snippet}
        </FormField>
      </form>
      {#snippet footer()}
        <Button variant="outline" onclick={() => (createOpen = false)}>Cancel</Button>
        <Button type="submit" form="pattern-kanban-new">Create</Button>
      {/snippet}
    </Dialog>
  </div>
  <div class="min-h-0 flex-1 overflow-auto p-4">
    <Kanban
      {columns}
      items={tasks}
      label="Sprint 14 board"
      getColumn={(task) => task.column}
      getItemId={(task) => task.id}
      getItemLabel={(task) => task.title}
      onMove={(task, to) => {
        task.column = to;
      }}
    >
      {#snippet card(task)}
        <Button
          type="button"
          variant="ghost"
          class="grid w-full gap-2 rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onclick={() => open(task)}
        >
          <span class="font-medium">{task.title}</span>
          <span class="flex items-center justify-between gap-2">
            <Avatar name={nameOf(task.assignee)} {...sampleFace(nameOf(task.assignee))} size="xs" decorative />
            <Badge variant={priorityTone[task.priority]}>{task.priority}</Badge>
          </span>
        </Button>
      {/snippet}
    </Kanban>
  </div>
</div>

<DetailPanel bind:open={panelOpen} title={selected?.title ?? 'Task'} description={selected ? `Assigned to ${nameOf(selected.assignee)}` : undefined}>
  {#if selected}
    {@const task = selected}
    <div class="grid gap-4">
      <FormField label="Title">
        {#snippet children({ props })}<Input {...props} bind:value={task.title} />{/snippet}
      </FormField>
      <FormField label="Status">
        {#snippet children({ props })}
          <Select {...props} bind:value={task.column} items={columns.map((c) => ({ value: c.id, label: c.title }))} />
        {/snippet}
      </FormField>
      <FormField label="Priority">
        {#snippet children({ props })}
          <Select
            {...props}
            bind:value={() => task.priority, (value) => (task.priority = value as Priority)}
            items={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
            ]}
          />
        {/snippet}
      </FormField>
      <FormField label="Assignee">
        {#snippet children({ id })}
          <UserPicker {id} users={PEOPLE} bind:value={task.assignee} label="Assignee" />
        {/snippet}
      </FormField>
      <FormField label="Notes">
        {#snippet children({ props })}<Textarea {...props} bind:value={task.notes} />{/snippet}
      </FormField>
    </div>
  {/if}
  {#snippet footer()}
    <AlertDialog
      title="Delete this task?"
      description="It will be removed from the board."
      confirmLabel="Delete"
      destructive
      onConfirm={remove}
    >
      {#snippet trigger({ props })}<Button {...props} variant="ghost">Delete</Button>{/snippet}
    </AlertDialog>
    <Button onclick={() => (panelOpen = false)}>Done</Button>
  {/snippet}
</DetailPanel>
