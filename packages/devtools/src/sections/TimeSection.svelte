<script lang="ts">
import type { Duration } from '@protoyard/core';
import { formatDateTime, formatOffset } from '../format.ts';
import Btn from '../primitives/Btn.svelte';
import Confirm from '../primitives/Confirm.svelte';
import Section from '../primitives/Section.svelte';
import type { DevtoolsState } from '../state.svelte.ts';

let { dt }: { dt: DevtoolsState } = $props();
const runtime = $derived(dt.runtime);
const clock = $derived.by(() => {
  const s = dt.clock;
  return {
    now: runtime.clock.now(),
    committed: runtime.clock.committed(),
    reference: runtime.clock.reference(),
    previewing: s.previewOffsetMs !== 0,
    previewOffsetMs: s.previewOffsetMs,
    committedOffsetMs: s.committedOffsetMs,
  };
});
const hasTimeline = $derived(typeof runtime.definition.timeline === 'function');
let lastAdvance = $state<string | null>(null);
let customTime = $state('');

const previews: { label: string; duration: Duration }[] = [
  { label: '−1 day', duration: { days: -1 } },
  { label: '+1 day', duration: { days: 1 } },
  { label: '+7 days', duration: { days: 7 } },
  { label: '+30 days', duration: { days: 30 } },
];

async function advance(days: number) {
  const result = await dt.run(`time:advance:${days}`, () => runtime.scenarios.advance({ days }));
  if (!result) return;
  dt.touchWorld();
  lastAdvance = hasTimeline
    ? `Advanced ${days} day${days === 1 ? '' : 's'}: ${result.applied} event${result.applied === 1 ? '' : 's'} applied, ${result.skipped} already applied.`
    : `Advanced ${days} day${days === 1 ? '' : 's'}. This prototype has no timeline, so no records changed.`;
  dt.notify('success', lastAdvance);
}

function previewAt() {
  if (!customTime) return;
  // datetime-local has no zone; simulated time is shown and entered in UTC.
  const date = new Date(`${customTime}:00Z`);
  if (Number.isNaN(date.getTime())) {
    dt.notify('error', 'Enter a valid date and time.');
    return;
  }
  runtime.clock.setTime(date);
}
</script>

<Section title="Simulated clock">
  <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[11px]">
    <dt class="text-muted-foreground">UI time</dt>
    <dd class="flex items-center gap-1.5 font-mono">
      {formatDateTime(clock.now)}
      {#if clock.previewing}
        <span class="rounded bg-warning px-1 font-sans text-[10px] font-medium text-warning-foreground">preview {formatOffset(clock.previewOffsetMs)}</span>
      {/if}
    </dd>
    <dt class="text-muted-foreground">Committed</dt>
    <dd class="font-mono">{formatDateTime(clock.committed)} <span class="text-muted-foreground">({formatOffset(clock.committedOffsetMs)})</span></dd>
    <dt class="text-muted-foreground">Reference</dt>
    <dd class="font-mono">{formatDateTime(clock.reference)}</dd>
  </dl>
</Section>

<Section title="Preview" description="Moves only the time the UI sees. No data changes.">
  <div class="grid grid-cols-4 gap-1.5">
    {#each previews as p (p.label)}
      <Btn onclick={() => runtime.clock.preview(p.duration)}>{p.label}</Btn>
    {/each}
  </div>
  <div class="mt-2 flex gap-1.5">
    <label class="sr-only" for="py-dt-preview-at">Preview at (UTC)</label>
    <input
      id="py-dt-preview-at"
      type="datetime-local"
      class="min-h-touch min-w-0 flex-1 rounded-md border border-input bg-surface px-2 text-xs text-surface-foreground sm:min-h-7"
      bind:value={customTime}
    />
    <Btn onclick={previewAt} disabled={!customTime}>Preview at</Btn>
  </div>
  <div class="mt-2">
    <Btn variant="ghost" disabled={!clock.previewing} onclick={() => runtime.clock.clearPreview()}>Clear preview</Btn>
  </div>
</Section>

<Section
  title="Advance"
  description={hasTimeline
    ? 'Commits deterministic timeline events. Idempotent: 7 × 1 day equals 1 × 7 days.'
    : 'This prototype defines no timeline: advancing moves committed time only.'}
>
  <div class="flex flex-wrap gap-1.5">
    <Btn variant="primary" busy={dt.isBusy('time:advance:1')} onclick={() => advance(1)}>Advance 1 day</Btn>
    <Btn variant="primary" busy={dt.isBusy('time:advance:7')} onclick={() => advance(7)}>Advance 7 days</Btn>
  </div>
  {#if lastAdvance}<p class="mt-2 text-[11px] text-muted-foreground">{lastAdvance}</p>{/if}
  <div class="mt-3">
    <Confirm
      label="Reset clock"
      confirmLabel="Reset clock"
      message="Returns the clock to the scenario reference time. Events already applied stay in the data — reset the scenario to undo them."
      onconfirm={() => runtime.clock.resetClock()}
    />
  </div>
</Section>
