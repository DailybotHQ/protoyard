<script lang="ts">
import { Button } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import type { SessionState, ValidationSession } from './session.ts';

/**
 * The validation task panel: the current task, a timer and step count while
 * it runs, and Start, Give up, Next and Download metrics. It sits in a corner
 * over the prototype and can be collapsed. Prompts are blueprint text,
 * rendered as plain text.
 */
let {
  session,
  onDownload,
}: {
  session: ValidationSession;
  onDownload: () => Promise<void>;
} = $props();

let view = $state<SessionState | null>(null);
let collapsed = $state(false);
let now = $state(Date.now());
let announcement = $state('');

$effect(() => {
  const current = session;
  return current.subscribe((next) => {
    if (next.current.phase === 'done' && view?.current.phase !== 'done') {
      const outcome = next.current.attempt.outcome;
      announcement =
        outcome === 'success'
          ? 'Task complete.'
          : outcome === 'gave-up'
            ? 'Task skipped.'
            : 'Time is up.';
    }
    view = next;
  });
});
const tick = setInterval(() => {
  if (view?.current.phase === 'running') now = Date.now();
}, 500);
onDestroy(() => clearInterval(tick));

function seconds(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const outcomeLabel = {
  success: 'Completed',
  'gave-up': 'Gave up',
  'timed-out': 'Time is up',
} as const;
</script>

<aside
  class="fixed bottom-4 left-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface text-surface-foreground shadow-float"
  aria-labelledby="py-validation-title"
  data-testid="validation-panel"
>
  <div class="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
    <h2 id="py-validation-title" class="text-sm font-semibold">
      {view ? `Task ${view.index + 1} of ${view.total}` : 'Tasks'}
    </h2>
    <Button
      type="button"
      variant="ghost"
      size="sm"
      class="px-2 text-xs text-muted-foreground"
      aria-expanded={!collapsed}
      onclick={() => (collapsed = !collapsed)}
    >
      {collapsed ? 'Show' : 'Hide'}
    </Button>
  </div>
  {#if view && !collapsed}
    <div class="space-y-3 px-4 py-3 text-sm">
      <p class="font-medium" data-testid="validation-prompt">{view.task.prompt}</p>
      {#if view.current.phase === 'running'}
        <p class="text-muted-foreground">
          <span>{seconds(now - view.current.startedAt)}</span>
          {#if view.task.timeLimitSeconds}<span> of {seconds(view.task.timeLimitSeconds * 1000)}</span>{/if}
          · {view.current.steps} steps
        </p>
      {:else if view.current.phase === 'done'}
        <p data-testid="validation-outcome">
          {outcomeLabel[view.current.attempt.outcome]} in {seconds(view.current.attempt.durationMs)} ·
          {view.current.attempt.steps} steps
        </p>
      {:else}
        <p class="text-muted-foreground">Start when you are ready. Time and steps are recorded in this browser only.</p>
      {/if}
      <div class="flex flex-wrap gap-2">
        {#if view.current.phase === 'ready'}
          <Button size="sm" onclick={() => session.start()}>Start task</Button>
        {:else if view.current.phase === 'running'}
          <Button size="sm" variant="outline" onclick={() => session.giveUp()}>Give up</Button>
        {:else if !view.finished}
          <Button size="sm" onclick={() => session.next()}>Next task</Button>
        {/if}
        <Button size="sm" variant="ghost" onclick={onDownload}>Download metrics</Button>
      </div>
      {#if view.finished}
        <p class="text-muted-foreground">All tasks done. Download the metrics to share them.</p>
      {/if}
    </div>
  {/if}
  <p class="sr-only" role="status" aria-live="polite">{announcement}</p>
</aside>
