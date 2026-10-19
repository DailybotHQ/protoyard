<script lang="ts">
import { ChevronDown, ChevronsUp, ChevronUp, Equal } from '@lucide/svelte';
import type { TaskPriority } from '../database/schema.ts';
import { PRIORITY_LABELS } from '../domain/tasks.ts';

let { priority, compact = false }: { priority: TaskPriority; compact?: boolean } = $props();

const styles: Record<TaskPriority, string> = {
  urgent: 'bg-destructive text-destructive-foreground',
  high: 'bg-warning text-warning-foreground',
  medium: 'bg-secondary text-secondary-foreground',
  low: 'bg-muted text-muted-foreground',
};
const icons = { urgent: ChevronsUp, high: ChevronUp, medium: Equal, low: ChevronDown };
const Icon = $derived(icons[priority]);
</script>

<span
  class={[
    'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.7rem] font-medium',
    styles[priority],
  ]}
  title={`${PRIORITY_LABELS[priority]} priority`}
>
  <Icon class="size-3" aria-hidden="true" />
  {#if compact}<span class="sr-only">{PRIORITY_LABELS[priority]} priority</span>{:else}{PRIORITY_LABELS[priority]}{/if}
</span>
