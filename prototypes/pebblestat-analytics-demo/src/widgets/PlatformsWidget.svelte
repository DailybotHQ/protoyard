<script lang="ts">
import { PieChart } from '@protoyard/charts-ui/part-whole';
import { countBy } from '../domain/metrics.ts';
import type { WidgetProps } from './types.ts';

let { title, events }: WidgetProps = $props();
const data = $derived(
  countBy(events, 'properties.platform').map((g) => ({ id: g.key, label: g.label, value: g.count }))
);
</script>

<PieChart {title} {data} height={200} emptyMessage="No events in this period" />
