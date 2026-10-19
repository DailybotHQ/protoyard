<script lang="ts">
import { LineChart } from '@protoyard/charts-ui/cartesian';
import { DonutChart } from '@protoyard/charts-ui/part-whole';
import { getRuntime } from '@protoyard/renderer-svelte';
import { Button } from '@protoyard/ui';

type State = 'data' | 'loading' | 'empty' | 'error';
const STATES: { id: State; label: string }[] = [
  { id: 'data', label: 'With data' },
  { id: 'loading', label: 'Loading' },
  { id: 'empty', label: 'Empty' },
  { id: 'error', label: 'Error' },
];
let state = $state<State>('data');

const days = [40, 52, 48, 61, 70, 66, 81].map((y, i) => ({ x: `Day ${i + 1}`, y }));
const series = $derived([
  {
    id: 'orders',
    label: 'Orders',
    points: state === 'empty' ? days.map((d) => ({ ...d, y: null })) : days,
  },
]);
const slices = $derived(
  state === 'empty'
    ? []
    : [
        { id: 'web', label: 'Web', value: 61 },
        { id: 'ios', label: 'iOS', value: 27 },
        { id: 'android', label: 'Android', value: 12 },
      ]
);
// A simulated fetch: retry resolves after a short delay and the charts show their data again.
const retry = () =>
  new Promise<void>((resolve) =>
    setTimeout(() => {
      state = 'data';
      resolve();
    }, 600)
  );

// Appearance lives in the runtime (persona preference / DevTools override); every chart re-reads it.
const runtime = (() => {
  try {
    return getRuntime();
  } catch {
    return null; // Rendered outside a prototype (tests): no appearance controls.
  }
})();
</script>

<div class="grid gap-4">
  <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Chart state">
    {#each STATES as option (option.id)}
      <Button size="sm" variant={state === option.id ? 'secondary' : 'ghost'} aria-pressed={state === option.id} onclick={() => (state = option.id)}>
        {option.label}
      </Button>
    {/each}
  </div>
  {#if runtime}
    {@const rt = runtime}
    <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Preview appearance">
      <Button size="sm" variant="outline" onclick={() => rt.theme.setOverride({ mode: 'light' })}>Light</Button>
      <Button size="sm" variant="outline" onclick={() => rt.theme.setOverride({ mode: 'dark' })}>Dark</Button>
      <Button size="sm" variant="outline" onclick={() => rt.theme.setOverride({ reducedMotion: true })}>Reduce motion</Button>
      <Button size="sm" variant="ghost" onclick={() => rt.theme.setOverride({ mode: 'system', reducedMotion: false })}>Reset</Button>
    </div>
  {/if}
  <div class="grid gap-6 lg:grid-cols-2">
    <LineChart
      title="Orders this week"
      {series}
      loading={state === 'loading'}
      error={state === 'error' ? 'The orders service did not answer (simulated).' : null}
      onretry={retry}
      emptyMessage="No orders this week"
    />
    <DonutChart
      title="Orders by platform"
      data={slices}
      loading={state === 'loading'}
      error={state === 'error' ? 'The orders service did not answer (simulated).' : null}
      onretry={retry}
      emptyMessage="No orders to split yet"
    />
  </div>
  <p class="text-xs text-muted-foreground">
    Charts read the theme's chart palette, switch with light and dark mode, and stop animating under reduced motion.
  </p>
</div>
