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
const TONES: Record<string, string> = {
  'tool-failure': 'text-destructive',
  'approval-rejected': 'text-destructive',
  'approval-requested': 'text-warning-foreground',
  'tool-result': 'text-success',
  'approval-granted': 'text-success',
  answer: 'text-primary',
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

<ol class="relative space-y-3 border-l border-border pl-6" aria-label="Agent steps">
  {#each steps as step (step.id)}
    {@const Icon = ICONS[step.type]}
    <li class="relative">
      <span class="absolute top-0.5 -left-[2.05rem] grid size-6 place-items-center rounded-full border border-border bg-surface {TONES[step.type] ?? 'text-muted-foreground'}">
        <LucideIcon icon={Icon} class="size-3.5" />
      </span>
      <div class="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span class="font-medium">{LABELS[step.type]}</span>
        {#if step.tool}<code class="rounded bg-muted px-1.5 py-0.5 text-xs">{step.tool}</code>{/if}
        <span class="text-xs text-muted-foreground">#{step.sequence} · {formatTime(step.createdAt)}</span>
      </div>
      {#if step.type !== 'answer'}<p class="mt-0.5 text-sm text-muted-foreground">{step.message}</p>{/if}
      {#if step.input !== undefined || (step.output !== undefined && step.type !== 'answer')}
        <details class="mt-1 text-xs">
          <summary class="cursor-pointer text-muted-foreground hover:text-foreground">Input / output</summary>
          <pre class="mt-1 max-h-60 overflow-auto rounded-md bg-muted p-2 font-mono whitespace-pre-wrap">{#if step.input !== undefined}input: {detail(step.input)}
{/if}{#if step.output !== undefined}output: {detail(step.output)}{/if}</pre>
        </details>
      {/if}
    </li>
  {/each}
</ol>
