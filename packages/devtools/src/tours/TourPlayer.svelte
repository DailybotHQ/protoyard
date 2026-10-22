<script lang="ts">
/**
 * Dismissible guided-tour player for DevTools and the blueprint player.
 *
 * Highlights a step target when it exists; when the target is missing the
 * card still renders and controls keep working. Clock advances go through the
 * controller's `onClockAdvance` hook (typically `runtime.scenarios.advance`).
 */
import { onDestroy, onMount } from 'svelte';
import Btn from '../primitives/Btn.svelte';
import type { TourController } from './controller.ts';
import type { TourState, TourStep } from './model.ts';

let {
  controller,
  /** Called after dismiss or when the tour completes and the host wants teardown. */
  onClose,
}: {
  controller: TourController;
  onClose?: () => void;
} = $props();

// svelte-ignore state_referenced_locally -- controller is a stable session object for this mount.
const session = controller;

let tourState = $state<TourState>(session.getState());
let step = $state<TourStep | null>(session.currentStep());
let targetRect = $state<DOMRect | null>(null);
let busy = $state(false);
let error = $state<string | null>(null);
let cardEl: HTMLDivElement | undefined = $state();

const unsubscribe = session.subscribe((next) => {
  tourState = next;
  step = session.currentStep();
  refreshTarget();
});

function refreshTarget() {
  const el = session.currentTarget();
  targetRect = el ? el.getBoundingClientRect() : null;
}

async function run(action: () => Promise<TourState> | TourState) {
  if (busy) return;
  busy = true;
  error = null;
  try {
    await action();
    refreshTarget();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    busy = false;
  }
}

function dismiss() {
  session.dismiss();
  onClose?.();
}

onMount(() => {
  refreshTarget();
  const onResize = () => refreshTarget();
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', onResize, true);
  // Auto-start when mounted idle so a single mount shows the first step.
  if (session.getState().status === 'idle') {
    void run(() => session.start());
  }
  // Move focus into the card for keyboard users.
  queueMicrotask(() => cardEl?.focus());
  return () => {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('scroll', onResize, true);
  };
});

onDestroy(() => {
  unsubscribe();
});

const stepCount = session.definition.steps.length;
const stepNumber = $derived(tourState.stepIndex >= 0 ? tourState.stepIndex + 1 : 0);
const isCompleted = $derived(tourState.status === 'completed');
const isDismissed = $derived(tourState.status === 'dismissed');
const canBack = $derived(tourState.status === 'active' && tourState.stepIndex > 0);
const primaryLabel = $derived(
  isCompleted ? 'Done' : tourState.stepIndex >= stepCount - 1 ? 'Finish' : 'Next'
);
</script>

{#if !isDismissed}
  <div
    class="py-tour"
    data-tour-id={session.definition.id}
    data-tour-status={tourState.status}
    data-tour-step={step?.id ?? ''}
  >
    {#if targetRect}
      <div
        class="py-tour-spotlight"
        style:top="{targetRect.top - 4}px"
        style:left="{targetRect.left - 4}px"
        style:width="{targetRect.width + 8}px"
        style:height="{targetRect.height + 8}px"
        aria-hidden="true"
      ></div>
    {/if}

    <div
      class="py-tour-card"
      bind:this={cardEl}
      role="dialog"
      aria-modal="false"
      aria-labelledby="py-tour-title"
      aria-describedby="py-tour-body"
      tabindex="-1"
    >
      <header class="py-tour-header">
        <p class="py-tour-eyebrow">{session.definition.title}</p>
        <p class="py-tour-progress" aria-live="polite">
          {#if isCompleted}
            Complete
          {:else}
            Step {stepNumber} of {stepCount}
            {#if tourState.storyDay > 0}
              · Day {tourState.storyDay}
            {/if}
          {/if}
        </p>
      </header>

      {#if step}
        <h2 id="py-tour-title" class="py-tour-title">{step.title}</h2>
        <p id="py-tour-body" class="py-tour-body">{step.body}</p>
      {:else if isCompleted}
        <h2 id="py-tour-title" class="py-tour-title">Tour complete</h2>
        <p id="py-tour-body" class="py-tour-body">
          You reached the end of this guided tour. Dismiss it or reset from DevTools to run it
          again.
        </p>
      {/if}

      {#if error}
        <p class="py-tour-error" role="alert">{error}</p>
      {/if}

      <div class="py-tour-actions">
        <Btn variant="ghost" disabled={busy} onclick={dismiss}>Dismiss</Btn>
        <div class="py-tour-actions-end">
          {#if canBack}
            <Btn variant="outline" disabled={busy} onclick={() => run(() => session.back())}>
              Back
            </Btn>
          {/if}
          {#if isCompleted}
            <Btn variant="primary" disabled={busy} onclick={dismiss}>{primaryLabel}</Btn>
          {:else}
            <Btn
              variant="primary"
              busy={busy}
              disabled={busy}
              onclick={() => run(() => session.next())}
            >
              {primaryLabel}
            </Btn>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .py-tour {
    position: fixed;
    inset: 0;
    z-index: 2147483000;
    pointer-events: none;
    font-family: var(--py-font-sans, system-ui, sans-serif);
  }
  .py-tour-spotlight {
    position: fixed;
    border-radius: 8px;
    box-shadow:
      0 0 0 9999px rgb(0 0 0 / 0.45),
      0 0 0 2px var(--py-ring, #6366f1);
    pointer-events: none;
    transition:
      top 120ms ease,
      left 120ms ease,
      width 120ms ease,
      height 120ms ease;
  }
  @media (prefers-reduced-motion: reduce) {
    .py-tour-spotlight {
      transition: none;
    }
  }
  .py-tour-card {
    pointer-events: auto;
    position: fixed;
    right: max(16px, env(safe-area-inset-right));
    bottom: max(16px, env(safe-area-inset-bottom));
    z-index: 1;
    display: grid;
    gap: 10px;
    width: min(360px, calc(100vw - 32px));
    padding: 16px;
    border-radius: 12px;
    border: 1px solid var(--py-border, #e5e7eb);
    background: var(--py-surface, #fff);
    color: var(--py-surface-foreground, #111827);
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.18);
    outline: none;
  }
  .py-tour-header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .py-tour-eyebrow {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--py-muted-foreground, #6b7280);
  }
  .py-tour-progress {
    margin: 0;
    font-size: 12px;
    color: var(--py-muted-foreground, #6b7280);
  }
  .py-tour-title {
    margin: 0;
    font-size: 16px;
    font-weight: 650;
    line-height: 1.3;
  }
  .py-tour-body {
    margin: 0;
    font-size: 13px;
    line-height: 1.45;
    color: var(--py-muted-foreground, #4b5563);
  }
  .py-tour-error {
    margin: 0;
    font-size: 12px;
    color: var(--py-destructive, #b91c1c);
  }
  .py-tour-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 4px;
  }
  .py-tour-actions-end {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>
