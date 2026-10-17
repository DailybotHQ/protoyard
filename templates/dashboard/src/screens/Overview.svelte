<script lang="ts">
import { CircleDollarSign, Plus, Receipt, ShoppingCart, UserPlus, Users } from '@lucide/svelte';
import { can, Link, liveQuery, useClock, usePrincipal } from '@protoyard/renderer-svelte';
import { Button, Card, EmptyState, ErrorState, Skeleton, StatCard } from '@protoyard/ui';
import BarChart from '../components/BarChart.svelte';
import CustomerDialog from '../components/CustomerDialog.svelte';
import OrderDialog from '../components/OrderDialog.svelte';
import PageHeader from '../components/PageHeader.svelte';
import StatusBadge from '../components/StatusBadge.svelte';
import { dailyRevenue, overviewStats } from '../domain/metrics.ts';
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

const currency = $derived(settings.current?.currency ?? 'USD');
const stats = $derived(
  overviewStats(data.current?.customers ?? [], data.current?.orders ?? [], clock.now)
);
const series = $derived(dailyRevenue(data.current?.orders ?? [], clock.now, 14));
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
      <Button variant="outline" onclick={() => (customerOpen = true)}><UserPlus class="size-4" aria-hidden="true" />Customer</Button>
    {/if}
    {#if can(CAPABILITIES.ordersCreate) && !isEmpty}
      <Button onclick={() => (orderOpen = true)}><Plus class="size-4" aria-hidden="true" />New order</Button>
    {/if}
  {/snippet}
</PageHeader>

{#if data.error}
  <ErrorState title="Could not load the overview" message={String(data.error)} />
{:else if data.current === undefined}
  <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Loading overview">
    {#each [0, 1, 2, 3] as i (i)}<Skeleton class="h-28 rounded-xl" />{/each}
  </div>
  <Skeleton class="mt-6 h-64 rounded-xl" />
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
        <Button onclick={() => (customerOpen = true)}><UserPlus class="size-4" aria-hidden="true" />Add your first customer</Button>
      {/if}
    {/snippet}
  </EmptyState>
{:else}
  <section aria-label="Key metrics" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <StatCard label="Revenue · 30 days" value={moneyCompact(stats.revenue30, currency)} delta={delta(stats.revenueDelta)} trend={trend(stats.revenueDelta)} hint="Paid and fulfilled orders" icon={CircleDollarSign} />
    <StatCard label="Orders · 30 days" value={stats.orders30.toLocaleString()} delta={delta(stats.ordersDelta)} trend={trend(stats.ordersDelta)} hint={`${stats.pending} pending overall`} icon={ShoppingCart} />
    <StatCard label="Active customers" value={stats.activeCustomers.toLocaleString()} hint={`${stats.newCustomers} new in 30 days`} icon={Users} />
    <StatCard label="Average order" value={money(stats.averageOrder, currency)} hint="Revenue orders, 30 days" icon={Receipt} />
  </section>

  <div class="mt-6 grid items-start gap-6 lg:grid-cols-5">
    <Card class="p-5 lg:col-span-3">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-sm font-semibold">Revenue · last 14 days</h2>
        <Link href="/orders" class="text-sm font-medium text-primary hover:underline">All orders</Link>
      </div>
      <BarChart data={series} {currency} label="Revenue per day for the last 14 days" />
    </Card>

    <Card class="p-5 lg:col-span-2">
      <h2 class="text-sm font-semibold">Recent activity</h2>
      <ul class="mt-3 divide-y divide-border">
        {#each data.current.events as item (item.id)}
          <li class="py-2.5 text-sm">
            <p class="truncate">
              <span class="font-medium">{data.current.names.get(item.actorId) ?? 'Someone'}</span>
              <span class="text-muted-foreground">· {item.message}</span>
            </p>
            <time class="text-xs text-muted-foreground" datetime={item.at}>{fromNow(item.at, clock.now)}</time>
          </li>
        {:else}
          <li class="py-3 text-sm text-muted-foreground">No activity yet.</li>
        {/each}
      </ul>
    </Card>
  </div>

  <Card class="mt-6 p-5">
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-semibold">Latest orders</h2>
      <Link href="/orders" class="text-sm font-medium text-primary hover:underline">View all</Link>
    </div>
    {#if recentOrders.length === 0}
      <p class="mt-3 text-sm text-muted-foreground">No orders yet. Create one from a customer's page.</p>
    {:else}
      <ul class="mt-2 divide-y divide-border">
        {#each recentOrders as order (order.id)}
          <li>
            <Link href={`/customers/${order.customerId}`} class="flex items-center justify-between gap-3 py-3 hover:text-primary">
              <span class="min-w-0">
                <span class="block truncate text-sm font-medium">{order.reference} · {customerName.get(order.customerId) ?? 'Unknown'}</span>
                <span class="block truncate text-xs text-muted-foreground">{order.description} · {fromNow(order.createdAt, clock.now)}</span>
              </span>
              <span class="flex shrink-0 items-center gap-3">
                <span class="text-sm tabular-nums">{money(order.amountCents, currency)}</span>
                <StatusBadge status={order.status} />
              </span>
            </Link>
          </li>
        {/each}
      </ul>
    {/if}
  </Card>
{/if}

<CustomerDialog bind:open={customerOpen} />
<OrderDialog bind:open={orderOpen} />
