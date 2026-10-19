<script lang="ts">
import { BarChart, seriesFromRows } from '@protoyard/charts-ui/cartesian';
import type { DailyTotal } from '../domain/metrics.ts';
import { formatDay } from '../lib/format.ts';

/**
 * Revenue per day with the charts kit: keyboard navigation, tooltips and a
 * data table toggle. Values stay integer cents; the kit formats them in the
 * workspace currency. Overview loads this file on demand.
 */
let {
  data,
  currency = 'USD',
  label,
}: { data: DailyTotal[]; currency?: string; label: string } = $props();

const series = $derived(
  seriesFromRows(data, {
    x: (d) => formatDay(d.day),
    series: [{ id: 'revenue', label: 'Revenue', y: (d) => d.total }],
  })
);
</script>

<BarChart title={label} {series} unit="cents" {currency} xHeader="Day" height={220} />
