<script lang="ts">
import { ArrowLeft, Building2, Globe, Mail, Pencil, Trash2, UserX } from '@lucide/svelte';
import {
  avatarImage,
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
  Badge,
  Button,
  Card,
  CardDescription,
  CardTitle,
  EmptyState,
  ErrorState,
  LoadingState,
} from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import { ListItem } from 'texuli/list-item';
import { Timeline } from 'texuli/timeline';
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
  (orders.current ?? []).filter(isRevenue).reduce((s, o) => s + o.amountCents, 0)
);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const historyItems = $derived(
  (history.current ?? []).map((item) => ({
    id: item.id,
    title: item.message,
    description: people.current?.get(item.actorId) ?? 'Someone',
    time: fromNow(item.at, clock.now),
    datetime: item.at,
  }))
);

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
  <LucideIcon icon={ArrowLeft} class="size-4" />Customers
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
      <Avatar name={c.name} {...avatarImage(c.avatar)} size="lg" />
      <div class="min-w-0">
        <h1 class="truncate text-2xl font-semibold tracking-tight">{c.name}</h1>
        <CardDescription class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span class="inline-flex items-center gap-1"><LucideIcon icon={Mail} class="size-3.5" />{c.email}</span>
          {#if c.company}<span class="inline-flex items-center gap-1"><LucideIcon icon={Building2} class="size-3.5" />{c.company}</span>{/if}
          {#if c.country}<span class="inline-flex items-center gap-1"><LucideIcon icon={Globe} class="size-3.5" />{c.country}</span>{/if}
        </CardDescription>
      </div>
    </div>
    <div class="flex flex-wrap gap-2">
      {#if can(CAPABILITIES.customersUpdate)}
        <Button variant="outline" onclick={() => (editOpen = true)}><LucideIcon icon={Pencil} class="size-4" />Edit</Button>
      {/if}
      {#if can(CAPABILITIES.customersDelete)}
        <Button variant="destructive" onclick={() => (deleteOpen = true)}><LucideIcon icon={Trash2} class="size-4" />Delete</Button>
      {/if}
    </div>
  </div>

  <dl class="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
    <Card class="p-4"><dt><CardDescription>Status</CardDescription></dt><dd class="mt-1.5"><StatusBadge status={c.status} /></dd></Card>
    <Card class="p-4"><dt><CardDescription>Plan</CardDescription></dt><dd class="mt-1 font-medium">{capitalize(c.plan)}</dd></Card>
    <Card class="p-4"><dt><CardDescription>Lifetime value</CardDescription></dt><dd class="mt-1 font-medium tabular-nums">{money(lifetime, currency)}</dd></Card>
    <Card class="p-4"><dt><CardDescription>Customer since</CardDescription></dt><dd class="mt-1 font-medium">{formatDate(c.createdAt)}</dd></Card>
  </dl>

  <div class="mt-6 grid gap-6 lg:grid-cols-5">
    <Card class="p-5 lg:col-span-3">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <CardTitle level={2}>Orders</CardTitle>
          <Badge variant="secondary">{(orders.current ?? []).length}</Badge>
        </div>
        {#if can(CAPABILITIES.ordersCreate)}
          <Button size="sm" variant="ghost" onclick={() => (orderOpen = true)}><Icon icon="plus" class="size-4" aria-hidden="true" />New order</Button>
        {/if}
      </div>
      {#if (orders.current ?? []).length === 0}
        <CardDescription class="mt-3">No orders yet.</CardDescription>
      {:else}
        <ul role="list" class="tx-list mt-2 -mx-3">
          {#each orders.current ?? [] as order (order.id)}
            <ListItem
              title={`${order.reference} · ${order.description}`}
              description={formatDate(order.createdAt)}
              meta={money(order.amountCents, currency)}
            >
              {#snippet trailing()}<OrderStatusMenu {order} />{/snippet}
            </ListItem>
          {/each}
        </ul>
      {/if}
    </Card>

    <Card class="p-5 lg:col-span-2">
      <CardTitle level={2}>History</CardTitle>
      {#if historyItems.length === 0}
        <CardDescription class="mt-3">No history yet.</CardDescription>
      {:else}
        <Timeline class="mt-3" label="Customer history" items={historyItems} />
      {/if}
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
