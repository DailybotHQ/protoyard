<script lang="ts">
import { Gauge, RadialProgress, Sparkline } from '@protoyard/charts-ui/compact';

const signups = [120, 132, 101, 134, 190, 230, 210, 240, 260, 255, 290, 310];
const churn = [4.1, 3.9, 4.4, 3.6, 3.2, 3.4, 2.9, 3.1, 2.7, 2.6];
const gaps = [12, 15, null, null, 18, 22, 19, 25];
</script>

<div class="grid gap-6">
  <div class="grid gap-4 sm:grid-cols-3">
    <div class="rounded-lg border border-border p-3">
      <p class="text-xs text-muted-foreground">Signups · line</p>
      <Sparkline values={signups} period="12 weeks" />
    </div>
    <div class="rounded-lg border border-border p-3">
      <p class="text-xs text-muted-foreground">Churn % · area</p>
      <Sparkline values={churn} variant="area" period="10 months" />
    </div>
    <div class="rounded-lg border border-border p-3">
      <p class="text-xs text-muted-foreground">Deploys · bars with gaps</p>
      <Sparkline values={gaps} variant="bar" period="8 days" />
    </div>
  </div>
  <div class="flex flex-wrap items-center gap-8">
    <Gauge label="Uptime this month" value={99.2} min={95} max={100} thresholds={[98, 99.5]} bandLabels={['Breach', 'At risk', 'Healthy']} format={{ type: 'number', minimumFractionDigits: 1, maximumFractionDigits: 1 }} />
    <Gauge label="CPU load" value={64} max={100} />
    <RadialProgress label="Onboarding complete" value={7} max={10} />
    <RadialProgress label="Storage used" value={0.82} max={1} />
  </div>
</div>
