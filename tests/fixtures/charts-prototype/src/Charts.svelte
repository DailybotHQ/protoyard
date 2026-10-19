<script lang="ts">
import { BarChart, LineChart } from '@protoyard/charts-ui/cartesian';

const day = 86_400_000;
const series = [
  { id: 'a', label: 'Signups', points: [1, 3, 2, 5].map((y, i) => ({ x: i * day, y })) },
];
const bars = [
  {
    id: 'b',
    label: 'Revenue',
    points: [
      { x: 'Q1', y: 4 },
      { x: 'Q2', y: 6 },
    ],
  },
];
</script>

<LineChart title="Signups" {series} />
<BarChart title="Revenue" series={bars} />
