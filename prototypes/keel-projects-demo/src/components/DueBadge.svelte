<script lang="ts">
import { CalendarClock } from '@lucide/svelte';
import { useClock } from '@protoyard/renderer-svelte';
import type { Task } from '../database/schema.ts';
import { dueState } from '../domain/tasks.ts';
import { dueLabel, formatDay } from '../lib/format.ts';

/** Due date relative to the SIMULATED clock: travel in time and tasks become overdue. */
let { task }: { task: Pick<Task, 'dueDate' | 'status'> } = $props();
const clock = useClock();
const due = $derived(dueState(task, clock.now));
</script>

{#if task.dueDate}
  <span
    class={[
      'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.7rem] font-medium tabular-nums',
      due === 'overdue' && 'bg-destructive text-destructive-foreground',
      due === 'today' && 'bg-warning/15 text-foreground',
      due === 'soon' && 'bg-info/10 text-foreground',
      (due === 'later' || due === 'done') && 'text-muted-foreground',
    ]}
    title={formatDay(task.dueDate)}
  >
    <CalendarClock class="size-3" aria-hidden="true" />
    {due === 'done' ? formatDay(task.dueDate) : dueLabel(task.dueDate, clock.now)}
  </span>
{/if}
