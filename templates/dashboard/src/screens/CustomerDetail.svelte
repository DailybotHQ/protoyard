<script lang="ts">
import { ArrowLeft, Building2, Globe, Mail, Pencil, Plus, Trash2, UserX } from '@lucide/svelte';
import {
  back,
  can,
  liveQuery,
  navigate,
  type RouteProps,
  runService,
  useClock,
} from '@protoyard/renderer-svelte';
import {
  AlertDialog,
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
} from '@protoyard/ui';
import CustomerDialog from '../components/CustomerDialog.svelte';
import OrderDialog from '../components/OrderDialog.svelte';
import OrderStatusMenu from '../components/OrderStatusMenu.svelte';
import StatusBadge from '../components/StatusBadge.svelte';
import { isRevenue } from '../domain/metrics.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useDashboard } from '../lib/context.ts';
import { formatDate, fromNow, money } from '../lib/format.ts';

let { params }: RouteProps = $props();
const { db, services, settings } = useDashboard();
const clock = useClock();
const id = () => params.id ?? '';

// `deps` re-subscribes every query when the route param changes.
const customer = liveQuery(() => db.customers.get(id()), { deps: id });
const orders = liveQuery(
  async () =>
    (await db.orders.where('customerId').equals(id()).toArray()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    ),
  { initial: [], deps: id }
);
const history = liveQuery(
  async () =>
    (await db.events.where('customerId').equals(id()).toArray())
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 20),
  { initial: [], deps: id }
);
const people = liveQuery(
  async () =>
    new Map(
      (await db.table('py_personas').toArray()).map((p) => [p.id as string, p.name as string])
    ),
  { initial: new Map<string, string>() }
);

let editOpen = $state(false);
let orderOpen = $state(false);
let deleteOpen = $state(false);
const currency = $derived(settings.current?.currency ?? 'USD');
const lifetime = $derived(
  (orders.current ?? []).filter(isRevenue).reduce((s, o) => s + o.amount, 0)
);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

async function remove(customerId: string) {
  const result = await runService(() => services.customers.remove(customerId), {
    success: 'Customer deleted',
  });
  if (result.ok) navigate('/customers', { replace: true });
  // Keeps the confirm dialog open with the message so the user can retry.
  else throw result.error instanceof Error ? result.error : new Error('Delete failed');
}
</script>

<Button variant="ghost" size="sm" class="-ml-2 mb-4" onclick={() => back('/customers')}>
  <ArrowLeft class="size-4" aria-hidden="true" />Customers
</Button>

{#if customer.error}
  <ErrorState title="Could not load this customer" message={String(customer.error)} />
{:else if customer.loading}
  <LoadingState label="Loading customer…" />
{:else if !customer.current}
  <EmptyState icon={UserX} title="Customer not found" description="It may have been deleted, or a different scenario is loaded.">
    {#snippet action()}<Button href="#/customers">Back to customers</Button>{/snippet}
  </EmptyState>
{:else}
  {@const c = customer.current}
  <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div class="flex min-w-0 items-center gap-4">
      <Avatar name={c.name} size="lg" />
      <div class="min-w-0">
        <h1 class="truncate text-2xl font-semibold tracking-tight">{c.name}</h1>
        <p class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span class="inline-flex items-center gap-1"><Mail class="size-3.5" aria-hidden="true" />{c.email}</span>
          {#if c.company}<span class="inline-flex items-center gap-1"><Building2 class="size-3.5" aria-hidden="true" />{c.company}</span>{/if}
          {#if c.country}<span class="inline-flex items-center gap-1"><Globe class="size-3.5" aria-hidden="true" />{c.country}</span>{/if}
        </p>
      </div>
    </div>
    <div class="flex flex-wrap gap-2">
      {#if can(CAPABILITIES.customersUpdate)}
        <Button variant="outline" onclick={() => (editOpen = true)}><Pencil class="size-4" aria-hidden="true" />Edit</Button>
      {/if}
      {#if can(CAPABILITIES.customersDelete)}
        <Button variant="outline" class="text-destructive" onclick={() => (deleteOpen = true)}><Trash2 class="size-4" aria-hidden="true" />Delete</Button>
      {/if}
    </div>
  </div>

  <dl class="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
    <Card class="p-4"><dt class="text-xs text-muted-foreground">Status</dt><dd class="mt-1.5"><StatusBadge status={c.status} /></dd></Card>
    <Card class="p-4"><dt class="text-xs text-muted-foreground">Plan</dt><dd class="mt-1 font-medium">{capitalize(c.plan)}</dd></Card>
    <Card class="p-4"><dt class="text-xs text-muted-foreground">Lifetime value</dt><dd class="mt-1 font-medium tabular-nums">{money(lifetime, currency)}</dd></Card>
    <Card class="p-4"><dt class="text-xs text-muted-foreground">Customer since</dt><dd class="mt-1 font-medium">{formatDate(c.createdAt)}</dd></Card>
  </dl>

  <div class="mt-6 grid gap-6 lg:grid-cols-5">
    <Card class="p-5 lg:col-span-3">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold">Orders <span class="font-normal text-muted-foreground">{(orders.current ?? []).length}</span></h2>
        {#if can(CAPABILITIES.ordersCreate)}
          <Button size="sm" variant="ghost" onclick={() => (orderOpen = true)}><Plus class="size-4" aria-hidden="true" />New order</Button>
        {/if}
      </div>
      <ul class="mt-3 divide-y divide-border">
        {#each orders.current ?? [] as order (order.id)}
          <li class="flex items-center justify-between gap-3 py-3">
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium">{order.reference} · {order.description}</span>
              <span class="block text-xs text-muted-foreground">{formatDate(order.createdAt)}</span>
            </span>
            <span class="flex shrink-0 items-center gap-3">
              <span class="text-sm tabular-nums">{money(order.amount, currency)}</span>
              <OrderStatusMenu {order} />
            </span>
          </li>
        {:else}
          <li class="py-3 text-sm text-muted-foreground">No orders yet.</li>
        {/each}
      </ul>
    </Card>

    <Card class="p-5 lg:col-span-2">
      <h2 class="text-sm font-semibold">History</h2>
      <ol class="mt-3 space-y-3">
        {#each history.current ?? [] as item (item.id)}
          <li class="relative border-l border-border pl-4 text-sm">
            <span class="absolute top-1.5 -left-[4.5px] size-2 rounded-full bg-primary" aria-hidden="true"></span>
            <p>{item.message}</p>
            <p class="text-xs text-muted-foreground">
              {people.current?.get(item.actorId) ?? 'Someone'} · <time datetime={item.at}>{fromNow(item.at, clock.now)}</time>
            </p>
          </li>
        {:else}
          <li class="text-sm text-muted-foreground">No history yet.</li>
        {/each}
      </ol>
    </Card>
  </div>

  <CustomerDialog bind:open={editOpen} customer={c} />
  <OrderDialog bind:open={orderOpen} customerId={c.id} />
  <AlertDialog
    bind:open={deleteOpen}
    destructive
    title={`Delete ${c.name}?`}
    description={`This also deletes ${(orders.current ?? []).length} orders and their history, in one transaction. Restore a snapshot from DevTools to undo.`}
    confirmLabel="Delete customer"
    onConfirm={() => remove(c.id)}
  />
{/if}
