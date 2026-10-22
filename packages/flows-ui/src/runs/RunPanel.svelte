<script lang="ts">
import { type Flow, type FlowRunResult, type FlowRuntimeOptions, runFlow } from '@protoyard/flows';

let {
  flow,
  runtimeOptions = {},
  onRun,
  onResult,
}: {
  flow: Flow;
  runtimeOptions?: FlowRuntimeOptions;
  onRun?: (flow: Flow, options: FlowRuntimeOptions) => FlowRunResult | Promise<FlowRunResult>;
  onResult?: (result: FlowRunResult) => void;
} = $props();

let pending = $state(false);
let result = $state<FlowRunResult | null>(null);
let error = $state('');

$effect(() => {
  flow;
  result = null;
  error = '';
});

async function run(): Promise<void> {
  if (pending) return;
  pending = true;
  error = '';
  try {
    await Promise.resolve();
    result = await (onRun ? onRun(flow, runtimeOptions) : runFlow(flow, runtimeOptions));
    onResult?.(result);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'The simulated run could not be completed.';
    result = null;
  } finally {
    pending = false;
  }
}
</script>

<section class="grid gap-4 rounded-xl border border-border bg-card p-4 text-foreground sm:p-6" aria-labelledby="flow-runs-heading">
  <header class="flex flex-wrap items-start justify-between gap-3">
    <div class="grid gap-1">
      <h2 id="flow-runs-heading" class="m-0 text-lg font-semibold">Test run</h2>
      <p class="m-0 text-sm text-muted-foreground">Runs use the deterministic local simulator. Effects are previews only.</p>
    </div>
    <button
      type="button"
      class="inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-wait disabled:opacity-60"
      disabled={pending}
      aria-busy={pending ? 'true' : undefined}
      onclick={run}
    >{pending ? 'Running…' : 'Run test'}</button>
  </header>

  {#if error}<p class="m-0 text-sm text-destructive" role="alert">{error}</p>{/if}
  {#if pending}<p class="m-0 text-sm text-muted-foreground" role="status" aria-live="polite">Running simulated workflow…</p>{/if}
  {#if result}
    <div class="grid gap-3 rounded-lg border border-border bg-background p-3" aria-live="polite" data-run-status={result.run.status}>
      <div class="flex flex-wrap items-center gap-2">
        <h3 class="m-0 text-base font-semibold">Latest result</h3>
        <span class="rounded-full bg-muted px-2 py-1 text-xs font-medium capitalize">{result.run.status}</span>
      </div>
      <dl class="m-0 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
        <div><dt class="text-muted-foreground">Started</dt><dd class="m-0">{result.run.startedAt}</dd></div>
        <div><dt class="text-muted-foreground">Finished</dt><dd class="m-0">{result.run.finishedAt ?? 'Waiting for input'}</dd></div>
        <div><dt class="text-muted-foreground">Visited steps</dt><dd class="m-0">{result.run.path.length}</dd></div>
        <div><dt class="text-muted-foreground">Proposed effects</dt><dd class="m-0">{result.effects.length}</dd></div>
      </dl>
      {#if result.run.error}<p class="m-0 text-sm text-destructive" role="alert">{result.run.error}</p>{/if}
      {#if result.signals.length}
        <ul class="m-0 grid gap-2 pl-5 text-sm" aria-label="Run signals">
          {#each result.signals as signal (signal.id)}<li><strong>{signal.title}</strong><span class="block text-muted-foreground">{signal.detail}</span></li>{/each}
        </ul>
      {/if}
      <p class="m-0 text-xs text-muted-foreground">No messages, tools or external services were contacted.</p>
    </div>
  {:else if !pending && !error}
    <p class="m-0 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Run the workflow to inspect its result, keeps and masked outbox.</p>
  {/if}
</section>
