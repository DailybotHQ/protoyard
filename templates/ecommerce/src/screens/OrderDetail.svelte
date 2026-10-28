<script lang="ts">
import { ArrowLeft, CircleCheckBig, PackageX } from '@lucide/svelte';
import {
  back,
  can,
  Link,
  liveQuery,
  type RouteProps,
  runService,
} from '@protoyard/renderer-svelte';
import { AlertDialog, Button, Card, EmptyState, ErrorState, Select, Skeleton } from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import OrderStatusBadge from '../components/OrderStatusBadge.svelte';
import type { OrderStatus } from '../database/schema.ts';
import { ORDER_STATUS_LABELS, SHIPPING_RATES } from '../domain/catalog.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { NEXT_STATUSES } from '../domain/services.ts';
import { useShop } from '../lib/context.ts';
import { formatDateTime, money } from '../lib/format.ts';

let { params, query }: RouteProps = $props();
const { db, services } = useShop();

const id = () => params.id ?? '';
const order = liveQuery(() => db.orders.get(id()), { deps: id });
const items = liveQuery(() => db.orderItems.where('orderId').equals(id()).toArray(), {
  initial: [],
  deps: id,
});
const customer = liveQuery(
  async () => {
    const o = await db.orders.get(id());
    return o
      ? ((await db.table('py_personas').get(o.customerId)) as { name: string } | undefined)
      : undefined;
  },
  { deps: id }
);

let confirmCancel = $state(false);
const justPlaced = $derived(query.get('placed') === '1');
const STEPS: OrderStatus[] = ['placed', 'processing', 'shipped', 'delivered'];

async function cancel() {
  const current = order.current;
  if (!current) return;
  const result = await runService(() => services.orders.cancel(current.id), {
    success: { title: 'Order cancelled', description: 'Items were returned to stock.' },
  });
  if (!result.ok)
    throw new Error(result.error instanceof Error ? result.error.message : 'Not cancelled');
}

async function setStatus(status: string) {
  const current = order.current;
  if (!current || status === current.status) return;
  if (status === 'cancelled') {
    confirmCancel = true;
    return;
  }
  await runService(() => services.orders.setStatus(current.id, status as OrderStatus), {
    success: `Marked as ${ORDER_STATUS_LABELS[status as OrderStatus].toLowerCase()}`,
  });
}
</script>

<Button variant="ghost" size="sm" class="-ml-2" onclick={() => back('/orders')}>
  <LucideIcon icon={ArrowLeft} class="size-4" />Orders
</Button>

{#if order.loading}
  <Skeleton class="mt-6 h-72 w-full rounded-xl" />
{:else if order.error}
  <ErrorState class="mt-6" title="Could not load this order" message={String(order.error)} />
{:else if !order.current || !can(CAPABILITIES.ordersReadOwn, order.current)}
  <EmptyState class="mt-6" icon={PackageX} title="Order not found" description="It may belong to another customer, or this scenario never had it.">
    {#snippet action()}<Button href="#/orders">Back to orders</Button>{/snippet}
  </EmptyState>
{:else}
  {@const current = order.current}
  {@const step = STEPS.indexOf(current.status)}
  {@const cancellable = (current.status === 'placed' || current.status === 'processing') && can(CAPABILITIES.ordersCancel, current)}
  {#if justPlaced}
    <div class="mt-4 flex gap-3 rounded-xl border border-success/50 bg-success/10 p-4" role="status">
      <LucideIcon icon={CircleCheckBig} class="mt-0.5 size-5 shrink-0 text-success" />
      <div class="text-sm">
        <p class="font-semibold">Thank you — order {current.number} is placed.</p>
        <p class="text-muted-foreground">Paid with the demo wallet. Stock was reserved and your cart is now empty.</p>
      </div>
    </div>
  {/if}

  <header class="mt-4 mb-6 flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 class="flex items-center gap-3 text-2xl font-semibold tracking-tight">Order <span class="font-mono">{current.number}</span></h1>
      <p class="mt-1 text-sm text-muted-foreground">
        Placed {formatDateTime(current.placedAt)}{customer.current ? ` by ${customer.current.name}` : ''}
      </p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <OrderStatusBadge status={current.status} />
      {#if can(CAPABILITIES.ordersManage) && NEXT_STATUSES[current.status].length > 0}
        <Select
          aria-label="Update order status"
          class="w-44"
          items={[current.status, ...NEXT_STATUSES[current.status]].map((s) => ({ value: s, label: s === current.status ? `Status: ${ORDER_STATUS_LABELS[s]}` : `Mark ${ORDER_STATUS_LABELS[s].toLowerCase()}` }))}
          value={current.status}
          onValueChange={setStatus}
        />
      {:else if cancellable}
        <Button variant="outline" class="text-destructive" onclick={() => (confirmCancel = true)}>Cancel order</Button>
      {/if}
    </div>
  </header>

  {#if current.status === 'cancelled'}
    <p class="mb-6 rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">This order was cancelled and its items returned to stock.</p>
  {:else}
    <ol class="mb-6 grid grid-cols-4 gap-2" aria-label="Order progress">
      {#each STEPS as s, i (s)}
        <li class="flex flex-col gap-2" aria-current={i === step ? 'step' : undefined}>
          <span class={['h-1.5 rounded-full', i <= step ? 'bg-primary' : 'bg-muted']}></span>
          <span class={['flex items-center gap-1 text-xs', i <= step ? 'font-medium text-foreground' : 'text-muted-foreground']}>
            {#if i < step}<Icon icon="check" class="size-3" aria-hidden="true" />{/if}{ORDER_STATUS_LABELS[s]}
            <span class="sr-only">{i < step ? '(done)' : i === step ? '(current)' : '(upcoming)'}</span>
          </span>
        </li>
      {/each}
    </ol>
  {/if}

  <div class="grid gap-6 lg:grid-cols-[1fr_20rem]">
    <Card class="p-5">
      <h2 class="font-semibold">Items</h2>
      <ul class="mt-3 divide-y divide-border">
        {#each items.current ?? [] as item (item.id)}
          <li class="flex items-center justify-between gap-3 py-3 text-sm">
            <span class="min-w-0">
              <Link href={`/products/${item.productId}`} class="font-medium hover:text-primary">{item.name}</Link>
              <span class="block text-muted-foreground tabular-nums">{item.quantity} × {money(item.unitPriceCents)}</span>
            </span>
            <span class="font-medium tabular-nums">{money(item.unitPriceCents * item.quantity)}</span>
          </li>
        {/each}
      </ul>
      <dl class="mt-2 space-y-2 border-t border-border pt-4 text-sm">
        <div class="flex justify-between"><dt class="text-muted-foreground">Subtotal</dt><dd class="tabular-nums">{money(current.subtotalCents)}</dd></div>
        <div class="flex justify-between"><dt class="text-muted-foreground">Shipping ({SHIPPING_RATES[current.shippingMethod].label})</dt><dd class="tabular-nums">{current.shippingCents ? money(current.shippingCents) : 'Free'}</dd></div>
        <div class="flex justify-between"><dt class="text-muted-foreground">Tax</dt><dd class="tabular-nums">{money(current.taxCents)}</dd></div>
        <div class="flex justify-between border-t border-border pt-2 text-base font-semibold"><dt>Total</dt><dd class="tabular-nums">{money(current.totalCents)}</dd></div>
      </dl>
    </Card>
    <Card class="h-fit p-5 text-sm">
      <h2 class="font-semibold">Ship to</h2>
      <address class="mt-2 not-italic text-muted-foreground">
        <span class="block text-foreground">{current.shipping.fullName}</span>
        {current.shipping.address}<br />
        {current.shipping.city} {current.shipping.postalCode}<br />
        {current.shipping.country}<br />
        {current.shipping.email}
      </address>
      <h2 class="mt-4 font-semibold">Payment</h2>
      <p class="mt-1 text-muted-foreground">Demo wallet (simulated — no card on file)</p>
      {#if cancellable && can(CAPABILITIES.ordersManage)}
        <Button variant="outline" size="sm" class="mt-4 text-destructive" onclick={() => (confirmCancel = true)}>Cancel order</Button>
      {/if}
    </Card>
  </div>

  <AlertDialog
    bind:open={confirmCancel}
    destructive
    title={`Cancel order ${current.number}?`}
    description="The order is cancelled and every item goes back into stock. This cannot be undone (restore a snapshot in DevTools to get it back)."
    confirmLabel="Cancel order"
    cancelLabel="Keep order"
    onConfirm={cancel}
  />
{/if}
