<script lang="ts">
import { liveQuery, runService, usePrincipal } from '@protoyard/renderer-svelte';
import { Card, CardContent, CardHeader, CardTitle, Notice, Select } from '@protoyard/ui';
import { Box, Text } from 'texuli/typography';
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
  <Notice tone="info" class="mb-4" text="Read-only persona: assignments are disabled." />
{/if}
<div class="grid gap-4 xl:grid-cols-2">
  {#each workload as group (group.person.id)}
    <Card>
      <CardHeader class="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>{group.person.name}</CardTitle>
        <Text as="span" size="sm" tone="muted" tabular>{group.items.length} open · {group.items.reduce((sum, task) => sum + task.estimateHours, 0)}h estimated</Text>
      </CardHeader>
      <CardContent>
        <ul>
          {#each group.items as task, index (task.id)}
            <li>
              <Box border={index > 0 ? 'block-start' : 'none'} radius="none" padding="none" class="flex flex-wrap items-center justify-between gap-3 py-3">
              <a href={`#/tasks/${task.id}`} class="min-w-0 flex-1"><Text as="span" weight="medium">{task.title}</Text><Text as="span" size="xs" tone="muted" class="ml-2">{task.estimateHours}h · due {task.dueDate ?? 'not set'}</Text></a>
              <label class="sr-only" for={`assign-${task.id}`}>Assignee for {task.title}</label>
              <Select
                id={`assign-${task.id}`}
                class="h-9 max-w-48"
                value={task.assigneeId ?? ''}
                items={[{ value: '', label: 'Unassigned' }, ...people.map((person) => ({ value: person.id, label: person.name }))]}
                disabled={!canAssign || saving.has(task.id)}
                aria-busy={saving.has(task.id)}
                onValueChange={(value) => assign(task.id, value)}
              />
              {#if saving.has(task.id)}<Text as="span" size="xs" tone="muted" role="status">Saving…</Text>{/if}
              </Box>
            </li>
          {:else}
            <li class="py-5"><Text size="sm" tone="muted">No open tasks assigned.</Text></li>
          {/each}
        </ul>
      </CardContent>
    </Card>
  {/each}
</div>
