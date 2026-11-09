<script lang="ts">
import { CalendarClock } from '@lucide/svelte';
import { useClock } from '@protoyard/renderer-svelte';
import { Badge, type BadgeVariant } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import type { Task } from '../database/schema.ts';
import { type DueState, dueState } from '../domain/tasks.ts';
import { dueLabel, formatDay } from '../lib/format.ts';

/** Due date relative to the SIMULATED clock: travel in time and tasks become overdue. */
let { task }: { task: Pick<Task, 'dueDate' | 'status'> } = $props();
const clock = useClock();
const due = $derived(dueState(task, clock.now));
const variants: Record<DueState, BadgeVariant> = {
  overdue: 'destructive',
  today: 'warning',
  soon: 'info',
  later: 'outline',
  done: 'outline',
  none: 'outline',
};
</script>

{#if task.dueDate}
  <Badge variant={variants[due]} class="gap-1" title={formatDay(task.dueDate)}>
    <LucideIcon icon={CalendarClock} size="xs" />
    {due === 'done' ? formatDay(task.dueDate) : dueLabel(task.dueDate, clock.now)}
  </Badge>
{/if}
