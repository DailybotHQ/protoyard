<script lang="ts">
import type { Snippet } from 'svelte';
import type { StepperStep } from '../components/stepper/types.ts';
import Wizard from '../components/wizard/Wizard.svelte';
import { cn } from '../lib/cn.ts';

interface Props {
  steps: StepperStep[];
  content: Snippet<[{ step: StepperStep; index: number }]>;
  current?: number;
  title?: string;
  description?: string;
  canAdvance?: (index: number) => boolean;
  validate?: (index: number) => unknown;
  onFinish?: () => void | Promise<void>;
  onStepChange?: (index: number) => void;
  backLabel?: string;
  nextLabel?: string;
  finishLabel?: string;
  secondaryActions?: Snippet;
  brand?: Snippet;
  class?: string;
}

let {
  steps,
  content,
  current = $bindable(0),
  title,
  description,
  canAdvance,
  validate,
  onFinish,
  onStepChange,
  backLabel,
  nextLabel,
  finishLabel,
  secondaryActions,
  brand,
  class: className,
}: Props = $props();
</script>

<main class={cn('min-h-app bg-muted/30 px-4 py-8 text-foreground sm:px-6 sm:py-12', className)} data-py-wizard-layout>
  <div class="mx-auto flex w-full max-w-4xl flex-col gap-8">
    <header class="flex flex-col items-center gap-3 text-center">
      {@render brand?.()}
      {#if title}<h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>{/if}
      {#if description}<p class="max-w-2xl text-sm text-muted-foreground sm:text-base">{description}</p>{/if}
    </header>

    <section class="rounded-xl border border-border bg-surface p-4 shadow-soft sm:p-8">
      <Wizard
        {steps}
        bind:current
        {content}
        {canAdvance}
        {validate}
        {onFinish}
        {onStepChange}
        {backLabel}
        {nextLabel}
        {finishLabel}
        {secondaryActions}
      />
    </section>
  </div>
</main>
