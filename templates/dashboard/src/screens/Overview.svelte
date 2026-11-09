<script lang="ts">
import { CircleDollarSign, Receipt, ShoppingCart, UserPlus, Users } from '@lucide/svelte';
import { can, liveQuery, useClock, usePrincipal } from '@protoyard/renderer-svelte';
import {
  Button,
  Card,
  CardDescription,
  CardTitle,
  EmptyState,
  ErrorState,
  Skeleton,
  StatCard,
} from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import { ListItem } from 'texuli/list-item';
import CustomerDialog from '../components/CustomerDialog.svelte';
import MetricCard from '../components/MetricCard.svelte';
import OrderDialog from '../components/OrderDialog.svelte';
import PageHeader from '../components/PageHeader.svelte';
import StatusBadge from '../components/StatusBadge.svelte';
import { dailyRevenue, overviewStats, overviewTrends } from '../domain/metrics.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useDashboard } from '../lib/context.ts';
import { fromNow, money, moneyCompact } from '../lib/format.ts';

const { db, settings } = useDashboard();
const clock = useClock();
const principal = usePrincipal();

// Re-run automatically when rows change — including scenario loads and snapshot restores.
const data = liveQuery(
  async () => {
    const [customers, orders, events, people] = await Promise.all([
      db.customers.toArray(),
      db.orders.toArray(),
      db.events.orderBy('at').reverse().limit(6).toArray(),
      db.table('py_personas').toArray(),
    ]);
    return {
      customers,
      orders,
      events,
      names: new Map(people.map((p) => [p.id as string, p.name as string])),
    };
  },
  { initial: undefined }
);

let customerOpen = $state(false);
let orderOpen = $state(false);
let chartAttempt = $state(0);

const currency = $derived(settings.current?.currency ?? 'USD');
const stats = $derived(
  overviewStats(data.current?.customers ?? [], data.current?.orders ?? [], clock.now)
);
const daily = $derived(dailyRevenue(data.current?.orders ?? [], clock.now, 14));
const trends = $derived(
  overviewTrends(data.current?.customers ?? [], data.current?.orders ?? [], clock.now)
);
const revenueTotal = $derived(daily.reduce((s, d) => s + d.total, 0));
const revenueOrders = $derived(daily.reduce((s, d) => s + d.count, 0));
const customerName = $derived(new Map((data.current?.customers ?? []).map((c) => [c.id, c.name])));
const recentOrders = $derived(
  [...(data.current?.orders ?? [])]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6)
);
const isEmpty = $derived(data.current !== undefined && data.current.customers.length === 0);
const firstName = $derived(principal.current?.persona.name.split(' ')[0] ?? 'there');
const delta = (value: number | null) =>
  value === null ? undefined : `${value > 0 ? '+' : ''}${value}%`;
const trend = (value: number | null) =>
  value === null
    ? undefined
    : value > 0
      ? ('up' as const)
      : value < 0
        ? ('down' as const)
        : ('neutral' as const);
</script>

<PageHeader title={`Welcome back, ${firstName}`} description="How your workspace is doing over the last 30 days.">
  {#snippet actions()}
    {#if can(CAPABILITIES.customersCreate) && !isEmpty}
      <Button variant="outline" onclick={() => (customerOpen = true)}><LucideIcon icon={UserPlus} class="size-4" />Customer</Button>
    {/if}
    {#if can(CAPABILITIES.ordersCreate) && !isEmpty}
      <Button onclick={() => (orderOpen = true)}><Icon icon="plus" class="size-4" aria-hidden="true" />New order</Button>
    {/if}
  {/snippet}
</PageHeader>

{#if data.error}
  <ErrorState title="Could not load the overview" message={String(data.error)} />
{:else if data.current === undefined}
  <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Loading overview">
    {#each [0, 1, 2, 3] as i (i)}<Skeleton class="h-28" />{/each}
  </div>
  <Skeleton class="mt-6 h-64" />
{:else if isEmpty}
  <EmptyState
    icon={Users}
    title="No customers yet"
    description={can(CAPABILITIES.customersCreate)
      ? 'Add your first customer. Orders, revenue and the chart on this page are all built from your own records.'
      : 'Nothing to show yet. Your role is read-only, so an owner, admin or member has to add customers first.'}
  >
    {#snippet action()}
      {#if can(CAPABILITIES.customersCreate)}
        <Button onclick={() => (customerOpen = true)}><LucideIcon icon={UserPlus} class="size-4" />Add your first customer</Button>
      {/if}
    {/snippet}
  </EmptyState>
{:else}
  <section aria-label="Key metrics" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <MetricCard label="Revenue · 30 days" value={moneyCompact(stats.revenue30, currency)} delta={delta(stats.revenueDelta)} trend={trend(stats.revenueDelta)} hint="Paid and fulfilled orders" icon={CircleDollarSign} trendValues={trends.revenue} trendFormat={(v) => moneyCompact(v, currency)} />
    <MetricCard label="Orders · 30 days" value={stats.orders30.toLocaleString()} delta={delta(stats.ordersDelta)} trend={trend(stats.ordersDelta)} hint={`${stats.pending} pending overall`} icon={ShoppingCart} trendValues={trends.orders} />
    <MetricCard label="Active customers" value={stats.activeCustomers.toLocaleString()} hint={`${stats.newCustomers} new in 30 days`} icon={Users} trendValues={trends.newCustomers} trendPeriod="30 days (new customers per day)" />
    <StatCard label="Average order" value={money(stats.averageOrder, currency)} hint="Revenue orders, 30 days" icon={Receipt} />
  </section>

  <div class="mt-6 grid items-start gap-6 lg:grid-cols-5">
    <Card class="p-5 lg:col-span-3">
      <div class="mb-3 flex items-center justify-between gap-3">
        <CardTitle level={2}>Revenue · last 14 days</CardTitle>
        <Button variant="link" size="sm" href="#/orders">All orders</Button>
      </div>
      <p><strong>{money(revenueTotal, currency)}</strong></p>
      <CardDescription class="mb-2">{revenueOrders.toLocaleString()} revenue order{revenueOrders === 1 ? '' : 's'} in 14 days</CardDescription>
      <!-- The charts kit loads on demand so the Overview route stays small. -->
      {#key chartAttempt}
        {#await import('../components/RevenueChart.svelte')}
          <div role="status" aria-label="Loading the revenue chart"><Skeleton class="h-56" /></div>
        {:then { default: RevenueChart }}
          <RevenueChart data={daily} {currency} label="Revenue per day for the last 14 days" />
        {:catch}
          <ErrorState title="Could not load the chart" message="The chart code did not download." onRetry={() => {
            chartAttempt += 1;
          }} />
        {/await}
      {/key}
    </Card>

    <Card class="p-5 lg:col-span-2">
      <CardTitle level={2}>Recent activity</CardTitle>
      {#if data.current.events.length === 0}
        <CardDescription class="mt-3">No activity yet.</CardDescription>
      {:else}
        <ul role="list" class="tx-list mt-2 -mx-3">
          {#each data.current.events as item (item.id)}
            <ListItem
              title={data.current.names.get(item.actorId) ?? 'Someone'}
              description={item.message}
              meta={fromNow(item.at, clock.now)}
            />
          {/each}
        </ul>
      {/if}
    </Card>
  </div>

  <Card class="mt-6 p-5">
    <div class="flex items-center justify-between gap-3">
      <CardTitle level={2}>Latest orders</CardTitle>
      <Button variant="link" size="sm" href="#/orders">View all</Button>
    </div>
    {#if recentOrders.length === 0}
      <CardDescription class="mt-3">No orders yet. Create one from a customer's page.</CardDescription>
    {:else}
      <ul role="list" class="tx-list mt-2 -mx-3">
        {#each recentOrders as order (order.id)}
          <ListItem
            href={`#/customers/${order.customerId}`}
            title={`${order.reference} · ${customerName.get(order.customerId) ?? 'Unknown'}`}
            description={`${order.description} · ${fromNow(order.createdAt, clock.now)}`}
            meta={money(order.amountCents, currency)}
          >
            {#snippet trailing()}<StatusBadge status={order.status} />{/snippet}
          </ListItem>
        {/each}
      </ul>
    {/if}
  </Card>
{/if}

<CustomerDialog bind:open={customerOpen} />
<OrderDialog bind:open={orderOpen} />
