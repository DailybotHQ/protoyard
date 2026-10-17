<script lang="ts">
import { ArrowLeft, ArrowRight } from '@lucide/svelte';
import type { Snippet } from 'svelte';
import { cn } from '../../lib/cn.ts';
import Button from '../button/Button.svelte';
import Stepper from '../stepper/Stepper.svelte';
import type { StepperStep } from '../stepper/types.ts';

interface Props {
  steps: StepperStep[];
  /** 0-based active step. */
  current?: number;
  /** Renders the body of the active step. */
  content: Snippet<[{ step: StepperStep; index: number }]>;
  /** Synchronous gate for the Next/Finish button (e.g. required fields filled). */
  canAdvance?: (index: number) => boolean;
  /** Runs on Next/Finish; return `false` or an error message to stay on the step. May be async. */
  validate?: (index: number) => unknown;
  onFinish?: () => void | Promise<void>;
  onStepChange?: (index: number) => void;
  backLabel?: string;
  nextLabel?: string;
  finishLabel?: string;
  /** Extra footer content (e.g. a Cancel button) shown on the left. */
  secondaryActions?: Snippet;
  class?: string;
}

let {
  steps,
  current = $bindable(0),
  content,
  canAdvance = () => true,
  validate,
  onFinish,
  onStepChange,
  backLabel = 'Back',
  nextLabel = 'Next',
  finishLabel = 'Finish',
  secondaryActions,
  class: className,
}: Props = $props();

let completed = $state(new Set<string>());
let busy = $state(false);
let error = $state<string | null>(null);
let panel = $state<HTMLElement | null>(null);

const step = $derived(steps[current]);
const isLast = $derived(current >= steps.length - 1);
const advanceAllowed = $derived(canAdvance(current));

function goTo(index: number): void {
  if (index < 0 || index >= steps.length || index === current) return;
  current = index;
  error = null;
  onStepChange?.(index);
  // Move focus to the new step so keyboard and screen-reader users land on its content.
  queueMicrotask(() => panel?.focus());
}

async function next(): Promise<void> {
  if (busy || !step || !advanceAllowed) return;
  busy = true;
  error = null;
  try {
    const result = await validate?.(current);
    if (result === false || typeof result === 'string') {
      error = typeof result === 'string' ? result : 'Please review this step before continuing.';
      return;
    }
    completed = new Set([...completed, step.id]);
    if (isLast) await onFinish?.();
    else goTo(current + 1);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'Something went wrong.';
  } finally {
    busy = false;
  }
}
</script>

<div class={cn('flex flex-col gap-6', className)}>
  <Stepper {steps} {current} completed={completed} onStepClick={(index) => index < current && goTo(index)} />

  {#if step}
    <section
      bind:this={panel}
      tabindex="-1"
      aria-label={`Step ${current + 1} of ${steps.length}: ${step.label}`}
      class="outline-none"
    >
      {@render content({ step, index: current })}
    </section>
  {/if}

  {#if error}
    <p role="alert" class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground">
      {error}
    </p>
  {/if}

  <div class="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
    <div class="flex gap-2">{@render secondaryActions?.()}</div>
    <div class="flex flex-col-reverse gap-2 sm:flex-row">
      {#if current > 0}
        <Button variant="outline" disabled={busy} onclick={() => goTo(current - 1)}>
          <ArrowLeft aria-hidden="true" />
          {backLabel}
        </Button>
      {/if}
      <Button loading={busy} disabled={!advanceAllowed} onclick={next}>
        {isLast ? finishLabel : nextLabel}
        {#if !isLast && !busy}<ArrowRight aria-hidden="true" />{/if}
      </Button>
    </div>
  </div>
</div>
