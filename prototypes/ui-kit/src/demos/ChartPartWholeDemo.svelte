<script lang="ts">
import {
  DonutChart,
  FunnelChart,
  PieChart,
  SankeyChart,
  Treemap,
} from '@protoyard/charts-ui/part-whole';

const plans = [
  { id: 'free', label: 'Free', value: 6200 },
  { id: 'pro', label: 'Pro', value: 2800 },
  { id: 'team', label: 'Team', value: 800 },
  { id: 'edu', label: 'Education', value: 120 },
  { id: 'np', label: 'Nonprofit', value: 80 },
];
const channels = [
  { id: 'search', label: 'Search', value: 48 },
  { id: 'referral', label: 'Referral', value: 27 },
  { id: 'social', label: 'Social', value: 15 },
  { id: 'email', label: 'Email', value: 10 },
];
const funnel = [
  { id: 'visit', label: 'Visited pricing', count: 12_400 },
  { id: 'signup', label: 'Signed up', count: 3_100 },
  { id: 'activate', label: 'Created a project', count: 1_640 },
  { id: 'paid', label: 'Started paying', count: 410 },
];
const nodes = [
  { id: 'visit', label: 'Visit' },
  { id: 'signup', label: 'Signup' },
  { id: 'bounce', label: 'Bounce' },
  { id: 'trial', label: 'Trial' },
  { id: 'paid', label: 'Paid' },
  { id: 'churn', label: 'Churned trial' },
];
const links = [
  { source: 'visit', target: 'signup', value: 3100 },
  { source: 'visit', target: 'bounce', value: 9300 },
  { source: 'signup', target: 'trial', value: 1640 },
  { source: 'trial', target: 'paid', value: 410 },
  { source: 'trial', target: 'churn', value: 1230 },
];
const spend = {
  id: 'all',
  label: 'All spend',
  children: [
    {
      id: 'infra',
      label: 'Infrastructure',
      children: [
        { id: 'compute', label: 'Compute', value: 4200 },
        { id: 'storage', label: 'Storage', value: 1600 },
        { id: 'network', label: 'Network', value: 700 },
      ],
    },
    {
      id: 'people',
      label: 'People',
      children: [
        { id: 'eng', label: 'Engineering', value: 9100 },
        { id: 'support', label: 'Support', value: 2400 },
      ],
    },
    { id: 'tools', label: 'Tools', value: 1300 },
  ],
};
</script>

<div class="grid gap-6 lg:grid-cols-2">
  <DonutChart title="Accounts by plan" data={plans} />
  <PieChart title="Signups by channel" data={channels} />
  <FunnelChart title="Activation funnel" steps={funnel} />
  <SankeyChart title="Visitor flow" {nodes} {links} />
  <div class="lg:col-span-2">
    <Treemap title="Monthly spend (Enter to drill in)" root={spend} />
  </div>
</div>
