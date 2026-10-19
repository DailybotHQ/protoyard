<script lang="ts">
import { liveQuery, runService, usePrincipal } from '@protoyard/renderer-svelte';
import { Card, CardContent, CardHeader, CardTitle } from '@protoyard/ui';
import PageHeader from '../components/PageHeader.svelte';
import { useWorkspace } from '../lib/context.svelte.ts';

const workspace = useWorkspace();
const principal = usePrincipal();
const tasks = liveQuery(() => workspace.db.tasks.orderBy('dueDate').toArray(), { initial: [] });
let saving = $state(new Set<string>());
const people = $derived(workspace.people.filter((person) => person.role !== 'viewer'));
const workload = $derived(
  people.map((person) => ({
    person,
    items: (tasks.current ?? []).filter(
      (task) => task.assigneeId === person.id && task.status !== 'done'
    ),
  }))
);
const canAssign = $derived(Boolean(principal.current && principal.current.role !== 'viewer'));

async function assign(taskId: string, value: string) {
  saving = new Set([...saving, taskId]);
  await runService(() => workspace.services.tasks.assign(taskId, value || null), {
    success: 'Assignment saved',
  });
  const next = new Set(saving);
  next.delete(taskId);
  saving = next;
}
</script>

<PageHeader title="Workload" description="Open work and estimated hours by teammate. Assignments are saved through project services." />
{#if !canAssign}
  <p class="mb-4 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">Read-only persona: assignments are disabled.</p>
{/if}
<div class="grid gap-4 xl:grid-cols-2">
  {#each workload as group (group.person.id)}
    <Card>
      <CardHeader class="flex-row items-center justify-between gap-3">
        <CardTitle>{group.person.name}</CardTitle>
        <span class="text-sm text-muted-foreground">{group.items.length} open · {group.items.reduce((sum, task) => sum + task.estimateHours, 0)}h estimated</span>
      </CardHeader>
      <CardContent>
        <ul class="divide-y divide-border">
          {#each group.items as task (task.id)}
            <li class="flex flex-wrap items-center justify-between gap-3 py-3">
              <a href={`#/tasks/${task.id}`} class="min-w-0 flex-1 font-medium hover:underline">{task.title}<span class="ml-2 text-xs text-muted-foreground">{task.estimateHours}h · due {task.dueDate ?? 'not set'}</span></a>
              <label class="sr-only" for={`assign-${task.id}`}>Assignee for {task.title}</label>
              <select
                id={`assign-${task.id}`}
                class="h-9 max-w-48 rounded-md border border-input bg-background px-2 text-sm"
                value={task.assigneeId ?? ''}
                disabled={!canAssign || saving.has(task.id)}
                aria-busy={saving.has(task.id)}
                onchange={(event) => assign(task.id, event.currentTarget.value)}
              >
                <option value="">Unassigned</option>
                {#each people as person (person.id)}<option value={person.id}>{person.name}</option>{/each}
              </select>
              {#if saving.has(task.id)}<span class="text-xs text-muted-foreground" role="status">Saving…</span>{/if}
            </li>
          {:else}
            <li class="py-5 text-sm text-muted-foreground">No open tasks assigned.</li>
          {/each}
        </ul>
      </CardContent>
    </Card>
  {/each}
</div>
