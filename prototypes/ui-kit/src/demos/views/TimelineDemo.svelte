<script lang="ts">
import { defaultPeople, generateTaskPlan, viewsFragments } from '@protoyard/views/scenarios';
import { TimelineView } from '@protoyard/views-ui/timeline';
import { onMount } from 'svelte';
import { createViewDemoContext } from './scenario.ts';

type Task = {
  id: string;
  title: string;
  start: `${number}-${number}-${number}`;
  end: `${number}-${number}-${number}`;
  progress: number;
};
let tasks = $state<Task[]>([]);
let dependencies = $state<{ from: string; to: string; type: 'FS' | 'SS' }[]>([]);
const query = $derived({ current: tasks, loading: false, error: null });
onMount(() => {
  void createViewDemoContext('plan', viewsFragments.plan('typical')).then((ctx) => {
    const plan = generateTaskPlan(ctx, { people: defaultPeople(ctx) });
    tasks = plan.tasks.map(({ id, title, start, end, progress }) => ({
      id,
      title,
      start: start as `${number}-${number}-${number}`,
      end: end as `${number}-${number}-${number}`,
      progress: progress / 100,
    }));
    dependencies = plan.dependencies.map(({ from, to, type }) => ({ from, to, type }));
  });
});
let message = $state('Drag or keyboard move a task to reschedule it.');
async function reschedule(changes: readonly { id: string; start?: string; end?: string }[]) {
  await Promise.resolve();
  const byId = new Map(changes.map((change) => [change.id, change]));
  tasks = tasks.map((task) => {
    const change = byId.get(task.id);
    return change
      ? {
          ...task,
          ...(change.start ? { start: change.start as Task['start'] } : {}),
          ...(change.end ? { end: change.end as Task['end'] } : {}),
        }
      : task;
  });
  message = 'Schedule change saved locally.';
}
</script>
<div class="space-y-2"><p class="text-sm text-muted-foreground" aria-live="polite">{message}</p><TimelineView {query} {dependencies} now={new Date('2026-10-20T12:00:00Z')} onReschedule={reschedule} /></div>
