<script lang="ts">
import { LineChart } from '@protoyard/charts-ui/cartesian';
import { trendSeries } from '../domain/metrics.ts';
import type { WidgetProps } from './types.ts';

let { title, events, range, granularity }: WidgetProps = $props();
const series = $derived([
  ...trendSeries(events, { range, granularity, measure: 'events' }),
  ...trendSeries(events, { range, granularity, measure: 'users' }).map((s) => ({
    ...s,
    id: 'users',
  })),
]);
</script>

<LineChart {title} {series} xKind="time" height={220} emptyMessage="No events in this period" />
