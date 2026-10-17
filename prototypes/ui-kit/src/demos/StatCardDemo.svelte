<script lang="ts">
import { Clock, DollarSign, UserMinus, Users } from '@lucide/svelte';
import { Button, StatCard } from '@protoyard/ui';

const week = {
  label: 'Last 7 days',
  revenue: '$12,480',
  revenueDelta: '+8.2%',
  users: 1284,
  usersDelta: 42,
  churn: '2.1%',
  churnDelta: '-0.4%',
  latency: '182 ms',
  latencyDelta: '+12 ms',
};
const periods = [
  week,
  {
    label: 'Last 30 days',
    revenue: '$51,920',
    revenueDelta: '+3.1%',
    users: 5310,
    usersDelta: -18,
    churn: '2.6%',
    churnDelta: '+0.3%',
    latency: '170 ms',
    latencyDelta: '0 ms',
  },
  {
    label: 'Last 90 days',
    revenue: '$148,300',
    revenueDelta: '+14.7%',
    users: 15022,
    usersDelta: 0,
    churn: '2.4%',
    churnDelta: '-1.2%',
    latency: '176 ms',
    latencyDelta: '-9 ms',
  },
];
let index = $state(0);
const period = $derived(periods[index] ?? week);
</script>

<div class="grid gap-4">
  <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Period">
    {#each periods as option, optionIndex (option.label)}
      <Button
        size="sm"
        variant={optionIndex === index ? 'secondary' : 'ghost'}
        aria-pressed={optionIndex === index}
        onclick={() => (index = optionIndex)}
      >
        {option.label}
      </Button>
    {/each}
  </div>
  <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <StatCard label="Revenue" value={period.revenue} delta={period.revenueDelta} trend="up" icon={DollarSign} hint="vs. previous period" />
    <StatCard label="Active users" value={period.users.toLocaleString()} delta={period.usersDelta} icon={Users} />
    <StatCard
      label="Churn"
      value={period.churn}
      delta={period.churnDelta}
      trend={period.churnDelta.startsWith('-') ? 'down' : 'up'}
      positive="down"
      icon={UserMinus}
      hint="lower is better"
    />
    <StatCard
      label="p95 latency"
      value={period.latency}
      delta={period.latencyDelta}
      trend={period.latencyDelta.startsWith('-') ? 'down' : period.latencyDelta.startsWith('+') ? 'up' : 'neutral'}
      positive="down"
      icon={Clock}
    />
  </div>
</div>
