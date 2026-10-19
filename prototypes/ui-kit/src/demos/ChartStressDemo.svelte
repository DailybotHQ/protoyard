<script lang="ts">
import { LineChart, ScatterChart } from '@protoyard/charts-ui/cartesian';
import { createRng } from '@protoyard/core';
import { Button } from '@protoyard/ui';

/*
 * The charts bench target: 10,000 deterministic points (fixed seed) drawn as
 * SVG (downsampled with LTTB) or on Canvas (every point, min/max per pixel
 * column). Hover, keys and the table still reach every point.
 */
const POINTS = 10_000;
const rng = createRng(20_261_019);
let level = 500;
const walk = Array.from({ length: POINTS }, (_, i) => {
  level = Math.max(0, level + rng.float(-12, 12.4));
  return { x: i, y: Math.round(level + 80 * Math.sin(i / 400)) };
});
const cloud = Array.from({ length: POINTS }, () => {
  const x = rng.float(0, 100);
  return { x, y: Math.round(x * 3 + rng.float(-40, 40)) };
});
const line = [{ id: 'requests', label: 'Requests', points: walk }];
const dots = [{ id: 'samples', label: 'Samples', points: cloud }];

type Renderer = 'auto' | 'svg' | 'canvas';
let renderer = $state<Renderer>('auto');
const RENDERERS: { id: Renderer; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'svg', label: 'SVG' },
  { id: 'canvas', label: 'Canvas' },
];
</script>

<div class="grid gap-4">
  <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Renderer">
    {#each RENDERERS as option (option.id)}
      <Button size="sm" variant={renderer === option.id ? 'secondary' : 'ghost'} aria-pressed={renderer === option.id} onclick={() => (renderer = option.id)}>
        {option.label}
      </Button>
    {/each}
    <span class="text-xs text-muted-foreground">{POINTS.toLocaleString()} points per chart · seed 20261019</span>
  </div>
  {#key renderer}
    <LineChart title="Requests per interval (10k points)" series={line} xKind="linear" xHeader="Interval" {renderer} />
    <ScatterChart title="Latency samples (10k points)" series={dots} xKind="linear" xHeader="Load" {renderer} />
  {/key}
</div>
