<script lang="ts">
import { DonutChart } from '@protoyard/charts-ui/part-whole';
import { countBy } from '../domain/metrics.ts';
import type { WidgetProps } from './types.ts';

let { title, events }: WidgetProps = $props();
// New users = signups in the range, split by the plan they signed up on.
const data = $derived(
  countBy(
    events.filter((e) => e.type === 'signup'),
    'properties.plan'
  ).map((g) => ({ id: g.key, label: g.label[0]?.toUpperCase() + g.label.slice(1), value: g.count }))
);
</script>

<DonutChart {title} {data} height={200} emptyMessage="No signups in this period" />
