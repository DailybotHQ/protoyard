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
import {
  AlertDialog,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Notice,
  Progress,
  Select,
  Skeleton,
} from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Heading, Text } from 'texuli/typography';
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
  <Skeleton class="mt-6 h-72 w-full" />
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
    <Notice
      tone="success"
      icon={CircleCheckBig}
      class="mt-4"
      title={`Thank you — order ${current.number} is placed.`}
      text="Paid with the demo wallet. Stock was reserved and your cart is now empty."
    />
  {/if}

  <header class="mt-4 mb-6 flex flex-wrap items-start justify-between gap-4">
    <div>
      <Heading level={1} size="xl">Order {current.number}</Heading>
      <Text size="sm" tone="muted" class="mt-1">
        Placed {formatDateTime(current.placedAt)}{customer.current ? ` by ${customer.current.name}` : ''}
      </Text>
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
        <Button variant="outline" tone="destructive" onclick={() => (confirmCancel = true)}>Cancel order</Button>
      {/if}
    </div>
  </header>

  {#if current.status === 'cancelled'}
    <Box surface="muted" border="default" radius="lg" padding="sm" class="mb-6"><Text size="sm" tone="muted">This order was cancelled and its items returned to stock.</Text></Box>
  {:else}
    <ol class="mb-6 grid grid-cols-4 gap-2" aria-label="Order progress">
      {#each STEPS as s, i (s)}
        <li class="flex flex-col gap-2" aria-current={i === step ? 'step' : undefined}>
          <Progress value={i <= step ? 100 : 0} size="sm" aria-hidden="true" />
          <Text as="span" size="xs" weight={i <= step ? 'medium' : 'regular'} tone={i <= step ? 'default' : 'muted'} class="flex items-center gap-1">
            {#if i < step}<Icon icon="check" class="size-3" aria-hidden="true" />{/if}{ORDER_STATUS_LABELS[s]}
            <span class="sr-only">{i < step ? '(done)' : i === step ? '(current)' : '(upcoming)'}</span>
          </Text>
        </li>
      {/each}
    </ol>
  {/if}

  <div class="grid gap-6 lg:grid-cols-3">
    <Card class="p-5 lg:col-span-2">
      <Heading level={2} size="sm">Items</Heading>
      <ul class="mt-3">
        {#each items.current ?? [] as item, index (item.id)}
          <li>
            <Box border={index > 0 ? 'block-start' : 'none'} radius="none" padding="none" class="flex items-center justify-between gap-3 py-3">
              <span class="min-w-0">
                <Text size="sm" weight="medium"><Link href={`/products/${item.productId}`}>{item.name}</Link></Text>
                <Text size="sm" tone="muted" tabular>{item.quantity} × {money(item.unitPriceCents)}</Text>
              </span>
              <Text as="span" size="sm" weight="medium" tabular>{money(item.unitPriceCents * item.quantity)}</Text>
            </Box>
          </li>
        {/each}
      </ul>
      <Box border="block-start" radius="none" padding="none" class="mt-2 pt-4">
      <dl class="space-y-2">
        <div class="flex justify-between"><dt><Text as="span" size="sm" tone="muted">Subtotal</Text></dt><dd><Text as="span" size="sm" tabular>{money(current.subtotalCents)}</Text></dd></div>
        <div class="flex justify-between"><dt><Text as="span" size="sm" tone="muted">Shipping ({SHIPPING_RATES[current.shippingMethod].label})</Text></dt><dd><Text as="span" size="sm" tabular>{current.shippingCents ? money(current.shippingCents) : 'Free'}</Text></dd></div>
        <div class="flex justify-between"><dt><Text as="span" size="sm" tone="muted">Tax</Text></dt><dd><Text as="span" size="sm" tabular>{money(current.taxCents)}</Text></dd></div>
        <Box border="block-start" radius="none" padding="none" class="flex justify-between pt-2"><dt><Text as="span" weight="semibold">Total</Text></dt><dd><Text as="span" weight="semibold" tabular>{money(current.totalCents)}</Text></dd></Box>
      </dl>
      </Box>
    </Card>
    <Card class="h-fit p-5">
      <Heading level={2} size="sm">Ship to</Heading>
      <div class="mt-2">
        <Text size="sm">{current.shipping.fullName}</Text>
        <Text size="sm" tone="muted">
          {current.shipping.address}<br />
          {current.shipping.city} {current.shipping.postalCode}<br />
          {current.shipping.country}<br />
          {current.shipping.email}
        </Text>
      </div>
      <Heading level={2} size="sm" class="mt-4">Payment</Heading>
      <Text size="sm" tone="muted" class="mt-1">Demo wallet (simulated — no card on file)</Text>
      {#if cancellable && can(CAPABILITIES.ordersManage)}
        <Button variant="outline" tone="destructive" size="sm" class="mt-4" onclick={() => (confirmCancel = true)}>Cancel order</Button>
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
