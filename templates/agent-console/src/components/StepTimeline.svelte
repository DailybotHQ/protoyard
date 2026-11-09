<script lang="ts">
import {
  Ban,
  CircleCheck,
  CircleX,
  Hand,
  ListChecks,
  MessageSquareText,
  ShieldCheck,
  ShieldX,
  Wrench,
} from '@lucide/svelte';
import type { AgentStep } from '@protoyard/ai';
import { formatTime } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import { Code } from 'texuli/kbd-code';
import { Timeline, TimelineItem, type TimelineTone } from 'texuli/timeline';
import { Text } from 'texuli/typography';

/** The agent step trace: plan → tool calls → approvals → results → answer. */
let { steps }: { steps: readonly AgentStep[] } = $props();

const ICONS = {
  plan: ListChecks,
  'tool-call': Wrench,
  'approval-requested': Hand,
  'approval-granted': ShieldCheck,
  'approval-rejected': ShieldX,
  'tool-result': CircleCheck,
  'tool-failure': CircleX,
  answer: MessageSquareText,
  cancelled: Ban,
} as const;
const TONES: Record<string, TimelineTone> = {
  'tool-failure': 'destructive',
  'approval-rejected': 'destructive',
  'approval-requested': 'warning',
  'tool-result': 'success',
  'approval-granted': 'success',
  answer: 'info',
};
const LABELS: Record<string, string> = {
  plan: 'Plan',
  'tool-call': 'Tool call',
  'approval-requested': 'Approval requested',
  'approval-granted': 'Approved',
  'approval-rejected': 'Rejected',
  'tool-result': 'Tool result',
  'tool-failure': 'Failure',
  answer: 'Answer',
  cancelled: 'Cancelled',
};

const detail = (value: unknown) => (value === undefined ? '' : JSON.stringify(value, null, 2));
</script>

<Timeline label="Agent steps">
  {#each steps as step (step.id)}
    {@const StepIcon = ICONS[step.type]}
    <TimelineItem
      title={LABELS[step.type] ?? step.type}
      time={`#${step.sequence} · ${formatTime(step.createdAt)}`}
      datetime={step.createdAt}
      description={step.type !== 'answer' ? step.message : undefined}
      tone={TONES[step.type] ?? 'neutral'}
    >
      {#snippet icon()}<LucideIcon icon={StepIcon} class="size-3.5" />{/snippet}
      {#if step.tool}<Code class="mt-1">{step.tool}</Code>{/if}
      {#if step.input !== undefined || (step.output !== undefined && step.type !== 'answer')}
        <details class="mt-1">
          <summary><Text as="span" size="xs" tone="muted">Input / output</Text></summary>
          <div class="mt-1 max-h-60 overflow-auto">
            <Code variant="block" class="whitespace-pre-wrap">{#if step.input !== undefined}input: {detail(step.input)}
{/if}{#if step.output !== undefined}output: {detail(step.output)}{/if}</Code>
          </div>
        </details>
      {/if}
    </TimelineItem>
  {/each}
</Timeline>
