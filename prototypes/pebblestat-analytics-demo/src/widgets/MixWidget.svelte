<script lang="ts">
import { BarChart } from '@protoyard/charts-ui/cartesian';
import { countBy } from '../domain/metrics.ts';
import type { WidgetProps } from './types.ts';

let { title, events }: WidgetProps = $props();
const series = $derived([
  {
    id: 'events',
    label: 'Events',
    points: countBy(events, 'type', 7).map((g) => ({ x: g.label, y: g.count })),
  },
]);
</script>

<BarChart {title} {series} orientation="horizontal" height={220} xHeader="Event" emptyMessage="No events in this period" />
