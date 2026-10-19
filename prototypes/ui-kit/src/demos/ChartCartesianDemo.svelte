<script lang="ts">
import {
  AreaChart,
  BarChart,
  ComboChart,
  LineChart,
  ScatterChart,
  seriesFromRows,
} from '@protoyard/charts-ui/cartesian';
import { createRng } from '@protoyard/core';

// Fixed seed: the same fictional numbers on every load.
const rng = createRng('ui-kit:charts:cartesian');
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 2, 2);
const days = Array.from({ length: 28 }, (_, i) => {
  const weekend = [0, 6].includes(new Date(T0 + i * DAY).getUTCDay());
  const signups = Math.round((weekend ? 70 : 120) + i * 2 + rng.float(-15, 15));
  return {
    at: T0 + i * DAY,
    signups,
    previous: Math.round(signups * rng.float(0.75, 0.95)),
    trials: Math.round(signups * rng.float(0.3, 0.45)),
    revenueCents: Math.round(signups * rng.float(900, 1400)) * 100,
  };
});
const quarters = [
  { q: 'Q1', north: 182_000_00, south: 141_000_00 },
  { q: 'Q2', north: 205_000_00, south: 158_500_00 },
  { q: 'Q3', north: 198_400_00, south: 171_200_00 },
  { q: 'Q4', north: 231_900_00, south: 166_800_00 },
];
const accounts = Array.from({ length: 60 }, (_, i) => ({
  seats: rng.int(3, 220),
  arrCents: 0,
  tickets: rng.int(0, 40),
  i,
})).map((a) => ({ ...a, arrCents: Math.round(a.seats * rng.float(80, 160)) * 100 }));

const trend = seriesFromRows(days, {
  x: (d) => d.at,
  series: [
    { id: 'signups', label: 'Signups', y: (d) => d.signups },
    { id: 'previous', label: 'Previous period', y: (d) => d.previous, comparison: true },
  ],
});
const stacked = seriesFromRows(days, {
  x: (d) => d.at,
  series: [
    { id: 'trials', label: 'Trials', y: (d) => d.trials },
    { id: 'paid', label: 'Paid', y: (d) => d.signups - d.trials },
  ],
});
const regions = seriesFromRows(quarters, {
  x: (d) => d.q,
  series: [
    { id: 'north', label: 'North', y: (d) => d.north },
    { id: 'south', label: 'South', y: (d) => d.south },
  ],
});
const combo = seriesFromRows(days, {
  x: (d) => d.at,
  series: [
    { id: 'revenue', label: 'Revenue', y: (d) => d.revenueCents },
    { id: 'signups', label: 'Signups', y: (d) => d.signups },
  ],
});
const scatter = [
  {
    id: 'accounts',
    label: 'Accounts',
    points: accounts.map((a) => ({ x: a.seats, y: a.arrCents, size: a.tickets, datum: a })),
  },
];
let selected = $state('Nothing selected yet');
</script>

<div class="grid gap-6 lg:grid-cols-2">
  <LineChart
    title="Signups, last 4 weeks"
    description="Daily signups against the previous period (dashed)."
    series={trend}
    xKind="time"
    onselect={(s) => (selected = `${s.series.label}: point ${s.index + 1}`)}
  />
  <AreaChart title="Trials and paid signups" series={stacked} xKind="time" stacked />
  <BarChart title="Revenue by region" series={regions} unit="cents" />
  <ComboChart title="Revenue and signups" series={combo} xKind="time" leftUnit="cents" rightUnit="number" />
  <ScatterChart title="Seats vs. ARR (bubble = open tickets)" series={scatter} xKind="linear" unit="cents" xHeader="Seats" />
  <p class="self-center text-sm text-muted-foreground" aria-live="polite">
    Focus a chart and use the arrow keys; Enter selects. Last selection: <strong>{selected}</strong>
  </p>
</div>
