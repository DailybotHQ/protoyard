<script lang="ts">
import { isValidationError, liveQuery, navigate, runService } from '@protoyard/renderer-svelte';
import { Button, Dialog, FormField, Input, Select, Textarea, UserPicker } from '@protoyard/ui';
import {
  TASK_LABELS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type Task,
  type TaskLabel,
  type TaskPriority,
  type TaskStatus,
} from '../database/schema.ts';
import { LABEL_NAMES, PRIORITY_LABELS, STATUS_LABELS } from '../domain/tasks.ts';
import { useWorkspace } from '../lib/context.svelte.ts';

/**
 * Create (no `task`) or edit a task. Field errors come back from the
 * service's zod validation and render inline; permission and network
 * failures become toasts via `runService`.
 */
let {
  open = $bindable(false),
  task = null,
  projectId = '',
  status = 'todo',
  openAfterCreate = false,
}: {
  open?: boolean;
  task?: Task | null;
  projectId?: string;
  status?: TaskStatus;
  openAfterCreate?: boolean;
} = $props();

const workspace = useWorkspace();
const { db, services, runtime } = workspace;
const projects = liveQuery(() => db.projects.orderBy('name').toArray(), { initial: [] });

let form = $state(blank());
let errors = $state<Record<string, string>>({});
let saving = $state(false);

$effect(() => {
  if (open) {
    form = blank();
    errors = {};
  }
});

function blank() {
  return {
    projectId: task?.projectId ?? projectId,
    title: task?.title ?? '',
    description: task?.description ?? '',
    status: (task?.status ?? status) as TaskStatus,
    priority: (task?.priority ?? 'medium') as TaskPriority,
    assigneeId: task?.assigneeId ?? (task ? '' : (runtime.session.principal()?.persona.id ?? '')),
    dueDate: task?.dueDate ?? '',
    labels: [...(task?.labels ?? [])] as TaskLabel[],
  };
}

function toggleLabel(label: TaskLabel) {
  form.labels = form.labels.includes(label)
    ? form.labels.filter((l) => l !== label)
    : [...form.labels, label];
}

async function submit(event: SubmitEvent) {
  event.preventDefault();
  saving = true;
  errors = {};
  const input = { ...form, assigneeId: form.assigneeId || null, dueDate: form.dueDate || null };
  const result = await runService<unknown>(
    () => (task ? services.tasks.update(task.id, input) : services.tasks.create(input)),
    { success: task ? 'Task updated' : 'Task created' }
  );
  saving = false;
  if (result.ok) {
    open = false;
    if (!task && openAfterCreate && result.value) navigate(`/tasks/${(result.value as Task).id}`);
  } else if (isValidationError(result.error)) {
    errors = result.error.issues;
  }
}

// The current user is preselected only if they can be assigned (viewers can't).
$effect(() => {
  if (open && !task && form.assigneeId && workspace.assignable.length > 0) {
    if (!workspace.assignable.some((p) => p.id === form.assigneeId)) form.assigneeId = '';
  }
});
</script>

<Dialog bind:open title={task ? 'Edit task' : 'New task'} description="Saved in this browser — survives reloads." size="lg">
  <form id="task-form" class="grid gap-4 sm:grid-cols-2" onsubmit={submit} novalidate>
    <FormField label="Title" required error={errors.title} class="sm:col-span-2">
      {#snippet children(control)}
        <Input {...control.props} bind:value={form.title} placeholder="e.g. Design the pricing page" autocomplete="off" maxlength={140} />
      {/snippet}
    </FormField>

    <FormField label="Description" error={errors.description} class="sm:col-span-2">
      {#snippet children(control)}
        <Textarea {...control.props} bind:value={form.description} rows={4} placeholder="Context, acceptance criteria, links…" />
      {/snippet}
    </FormField>

    <FormField label="Project" required error={errors.projectId}>
      {#snippet children(control)}
        <Select
          {...control.props}
          items={(projects.current ?? []).map((p) => ({ value: p.id, label: `${p.name} (${p.key})` }))}
          bind:value={form.projectId}
          placeholder={(projects.current ?? []).length ? 'Choose a project' : 'Create a project first'}
        />
      {/snippet}
    </FormField>

    <FormField label="Status" error={errors.status}>
      {#snippet children(control)}
        <Select {...control.props} items={TASK_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))} bind:value={form.status} />
      {/snippet}
    </FormField>

    <FormField label="Assignee" error={errors.assigneeId}>
      {#snippet children(control)}
        <div class="flex gap-2">
          <UserPicker
            id={control.id}
            class="min-w-0 flex-1"
            label="Assignee"
            users={workspace.assignable}
            bind:value={form.assigneeId}
            placeholder="Unassigned"
            searchPlaceholder="Search teammates…"
          />
          {#if form.assigneeId}
            <Button variant="ghost" size="sm" class="h-10" onclick={() => (form.assigneeId = '')}>Clear</Button>
          {/if}
        </div>
      {/snippet}
    </FormField>

    <FormField label="Priority" error={errors.priority}>
      {#snippet children(control)}
        <Select {...control.props} items={TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))} bind:value={form.priority} />
      {/snippet}
    </FormField>

    <FormField label="Due date" description="Optional" error={errors.dueDate}>
      {#snippet children(control)}
        <div class="flex gap-2">
          <Input {...control.props} type="date" bind:value={form.dueDate} class="min-w-0 flex-1" />
          {#if form.dueDate}
            <Button variant="ghost" size="sm" class="h-10" onclick={() => (form.dueDate = '')}>Clear</Button>
          {/if}
        </div>
      {/snippet}
    </FormField>

    <fieldset class="sm:col-span-2">
      <legend class="text-sm font-medium">Labels <span class="font-normal text-muted-foreground">(up to 4)</span></legend>
      <div class="mt-2 flex flex-wrap gap-1.5">
        {#each TASK_LABELS as label (label)}
          {@const on = form.labels.includes(label)}
          <Button
            type="button"
            aria-pressed={on}
            onclick={() => toggleLabel(label)}
            class={[
              'min-h-touch rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring sm:min-h-0',
              on ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-muted',
            ]}
          >
            {LABEL_NAMES[label]}
          </Button>
        {/each}
      </div>
      {#if errors.labels}<p class="mt-1.5 text-sm text-destructive" role="alert">{errors.labels}</p>{/if}
    </fieldset>
  </form>

  {#snippet footer()}
    <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
    <Button type="submit" form="task-form" loading={saving}>{task ? 'Save changes' : 'Create task'}</Button>
  {/snippet}
</Dialog>
