<script lang="ts">
import { CalendarHeatmap, Heatmap, Histogram } from '@protoyard/charts-ui/matrix';
import { createRng } from '@protoyard/core';

const rng = createRng('ui-kit:charts:matrix');
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const hours = ['00', '03', '06', '09', '12', '15', '18', '21'];
// Busy weekday working hours, quiet nights and weekends.
const activity = weekdays.map((_, d) =>
  hours.map((_, h) =>
    Math.round((d < 5 ? 1 : 0.35) * (h >= 3 && h <= 6 ? 90 : 25) * rng.float(0.7, 1.3))
  )
);
const growth = weekdays.map(() => hours.map(() => Math.round(rng.float(-40, 40))));

const DAY = 86_400_000;
const start = Date.UTC(2026, 0, 1);
const commits: Record<string, number> = {};
for (let i = 0; i < 120; i++) {
  const weekend = [0, 6].includes(new Date(start + i * DAY).getUTCDay());
  const value = weekend ? rng.int(0, 2) : rng.int(0, 12);
  if (value > 0) commits[new Date(start + i * DAY).toISOString().slice(0, 10)] = value;
}
// Response times in ms: a log-normal-ish spread from summed uniforms.
const latencies = Array.from({ length: 800 }, () =>
  Math.round(80 + 40 * (rng.next() + rng.next() + rng.next() + rng.next()) ** 2)
);
</script>

<div class="grid gap-6 lg:grid-cols-2">
  <Heatmap title="Sessions by weekday and hour" rows={weekdays} cols={hours} values={activity} />
  <Heatmap title="Change vs. last week (%)" rows={weekdays} cols={hours} values={growth} diverging mid={0} showValues />
  <div class="lg:col-span-2">
    <CalendarHeatmap title="Commits per day" start="2026-01-01" end="2026-04-30" values={commits} />
  </div>
  <Histogram title="API response time (ms)" values={latencies} rules={['median', 'mean']} />
</div>
