<script lang="ts">
import { LineChart } from '@protoyard/charts-ui/cartesian';
import { rollupSeries, trendSeries } from '../domain/metrics.ts';
import type { WidgetProps } from './types.ts';

let { title, events, rollups, sampleRate, range, granularity }: WidgetProps = $props();
// Sampled projects: events come from the exact daily rollups; users are estimated from the sample.
const sampled = $derived(sampleRate < 1);
const series = $derived([
  ...(sampled
    ? [{ id: 'total', label: 'Events (daily, exact)', points: rollupSeries(rollups, range) }]
    : trendSeries(events, { range, granularity, measure: 'events' })),
  ...trendSeries(events, {
    range,
    granularity: sampled ? 'day' : granularity,
    measure: 'users',
  }).map((s) => ({
    ...s,
    id: 'users',
    label: sampled ? 'Users (estimated)' : s.label,
    points: s.points.map((p) => ({ ...p, y: p.y === null ? null : Math.round(p.y / sampleRate) })),
  })),
]);
</script>

<LineChart {title} {series} xKind="time" height={220} emptyMessage="No events in this period" />
