<script lang="ts">
import { ChevronDown, ChevronsUp, ChevronUp, Equal } from '@lucide/svelte';
import { Badge, type BadgeVariant } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import type { TaskPriority } from '../database/schema.ts';
import { PRIORITY_LABELS } from '../domain/tasks.ts';

let { priority, compact = false }: { priority: TaskPriority; compact?: boolean } = $props();

const variants: Record<TaskPriority, BadgeVariant> = {
  urgent: 'destructive',
  high: 'warning',
  medium: 'secondary',
  low: 'neutral',
};
const icons = { urgent: ChevronsUp, high: ChevronUp, medium: Equal, low: ChevronDown };
const Icon = $derived(icons[priority]);
</script>

<Badge variant={variants[priority]} class="shrink-0 gap-1" title={`${PRIORITY_LABELS[priority]} priority`}>
  <LucideIcon icon={Icon} size="xs" />
  {#if compact}<span class="sr-only">{PRIORITY_LABELS[priority]} priority</span>{:else}{PRIORITY_LABELS[priority]}{/if}
</Badge>
