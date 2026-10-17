<script lang="ts">
import { Check } from '@lucide/svelte';
import { cn } from '../../lib/cn.ts';
import type { StepperStep } from './types.ts';

interface Props {
  steps: StepperStep[];
  /** 0-based index of the active step. */
  current: number;
  /** Ids of completed steps; defaults to every step before `current`. */
  completed?: Iterable<string>;
  orientation?: 'horizontal' | 'vertical';
  /** Makes completed steps (and the current one) clickable for back-navigation. */
  onStepClick?: (index: number) => void;
  label?: string;
  class?: string;
}

let {
  steps,
  current,
  completed,
  orientation = 'horizontal',
  onStepClick,
  label = 'Progress',
  class: className,
}: Props = $props();

const done = $derived(
  completed ? new Set(completed) : new Set(steps.slice(0, Math.max(0, current)).map((s) => s.id))
);
const vertical = $derived(orientation === 'vertical');
</script>

<nav aria-label={label} class={className}>
  <ol class={cn('flex', vertical ? 'flex-col gap-0' : 'items-start gap-2 overflow-x-auto')}>
    {#each steps as step, index (step.id)}
      {@const isCurrent = index === current}
      {@const isDone = done.has(step.id) && !isCurrent}
      {@const clickable = onStepClick !== undefined && (isDone || isCurrent)}
      {@const isLast = index === steps.length - 1}
      <li
        aria-current={isCurrent ? 'step' : undefined}
        class={cn('relative flex', vertical ? 'gap-3 pb-6 last:pb-0' : 'min-w-0 flex-1 flex-col gap-2')}>
        {#if !isLast}
          <span
            aria-hidden="true"
            class={cn(
              'absolute bg-border',
              vertical ? 'top-8 bottom-1 left-[0.9375rem] w-px' : 'top-4 right-1 left-10 h-px',
              isDone && 'bg-primary'
            )}
          ></span>
        {/if}
        {#snippet stepBody()}
          <span
            class={cn(
              'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums transition-colors',
              isDone && 'border-primary bg-primary text-primary-foreground',
              isCurrent && 'border-primary bg-surface text-primary ring-4 ring-primary/15',
              !isDone && !isCurrent && 'border-border bg-surface text-muted-foreground'
            )}
          >
            {#if isDone}<Check class="size-4" strokeWidth={3} aria-hidden="true" />{:else}{index + 1}{/if}
          </span>
          <span class={cn('grid min-w-0 gap-0.5', !vertical && 'sr-only sm:not-sr-only sm:grid', vertical && 'pt-1.5')}>
            <span class={cn('truncate text-sm font-medium', isCurrent || isDone ? 'text-foreground' : 'text-muted-foreground')}>
              {step.label}
            </span>
            {#if step.description}<span class="text-xs text-muted-foreground">{step.description}</span>{/if}
          </span>
          <span class="sr-only">
            {isDone ? '(completed)' : isCurrent ? '(current step)' : '(not started)'}
          </span>
        {/snippet}
        {#if clickable}
          <button
            type="button"
            class={cn(
              'flex items-start gap-3 rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
              !vertical && 'flex-col gap-2 sm:flex-row sm:gap-3'
            )}
            onclick={() => onStepClick?.(index)}
          >
            {@render stepBody()}
          </button>
        {:else}
          <div class={cn('flex items-start gap-3', !vertical && 'flex-col gap-2 sm:flex-row sm:gap-3')}>
            {@render stepBody()}
          </div>
        {/if}
      </li>
    {/each}
  </ol>
</nav>
