<script lang="ts">
import { House, Package, Search, User } from '@lucide/svelte';
import {
  Badge,
  type BadgeVariant,
  BottomNav,
  BottomSheet,
  Button,
  EmptyState,
  MobileHeader,
  type NavItem,
  toast,
} from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { interceptDemoNav } from './nav.ts';

type Status = 'Preparing' | 'Shipped' | 'Delivered';
interface Order {
  id: string;
  customer: string;
  items: number;
  total: number;
  status: Status;
}

const tone: Record<Status, BadgeVariant> = {
  Preparing: 'warning',
  Shipped: 'info',
  Delivered: 'success',
};
const NEXT: Record<Status, Status | null> = {
  Preparing: 'Shipped',
  Shipped: 'Delivered',
  Delivered: null,
};

let orders = $state<Order[]>([
  { id: '#1042', customer: 'Mia Okafor', items: 3, total: 84, status: 'Preparing' },
  { id: '#1041', customer: 'Leo Berg', items: 1, total: 29, status: 'Shipped' },
  { id: '#1040', customer: 'Ivy Tanaka', items: 5, total: 142, status: 'Preparing' },
  { id: '#1039', customer: 'Noah Ruiz', items: 2, total: 56, status: 'Delivered' },
  { id: '#1038', customer: 'Ana Lee', items: 4, total: 97, status: 'Delivered' },
  { id: '#1037', customer: 'Omar Diaz', items: 1, total: 18, status: 'Shipped' },
]);
let tab = $state('#demo/mobile/orders');
let sheetOpen = $state(false);
let selectedId = $state<string | null>(null);
let counter = $state(1043);
const selected = $derived(orders.find((order) => order.id === selectedId));
const pending = $derived(orders.filter((order) => order.status === 'Preparing').length);

const tabs: NavItem[] = $derived(
  [
    { label: 'Home', href: '#demo/mobile/home', icon: House },
    {
      label: 'Orders',
      href: '#demo/mobile/orders',
      icon: Package,
      badge: pending > 0 ? pending : undefined,
    },
    { label: 'Search', href: '#demo/mobile/search', icon: Search },
    { label: 'Account', href: '#demo/mobile/account', icon: User },
  ].map((item) => ({ ...item, active: item.href === tab }))
);
const tabTitle = $derived(tabs.find((item) => item.active)?.label ?? 'Orders');

function openOrder(id: string): void {
  selectedId = id;
  sheetOpen = true;
}

function advance(): void {
  if (!selected) return;
  const next = NEXT[selected.status];
  if (!next) return;
  selected.status = next;
  sheetOpen = false;
  toast.success(`Order ${selected.id} ${next.toLowerCase()}`);
}

function addOrder(): void {
  orders.unshift({
    id: `#${counter}`,
    customer: 'Walk-in customer',
    items: 1,
    total: 12,
    status: 'Preparing',
  });
  counter += 1;
}
</script>

<div class="relative mx-auto flex h-[640px] max-w-[390px] flex-col overflow-hidden rounded-[2rem] border-4 border-border bg-background">
  <div class="min-h-0 flex-1 overflow-y-auto">
    <MobileHeader titleAs="p" title={tabTitle} subtitle={tab.endsWith('/orders') ? `${orders.length} orders · ${pending} to prepare` : undefined}>
      {#snippet actions()}
        {#if tab.endsWith('/orders')}
          <Button size="icon" variant="ghost" aria-label="New order" onclick={addOrder}>
            <Icon icon="plus" aria-hidden="true" />
          </Button>
        {/if}
      {/snippet}
    </MobileHeader>
    {#if tab.endsWith('/orders')}
      <ul class="divide-y divide-border">
        {#each orders as order (order.id)}
          <li>
            <Button
              type="button"
              variant="ghost"
              class="flex min-h-touch w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
              onclick={() => openOrder(order.id)}
            >
              <span class="grid min-w-0">
                <span class="truncate text-sm font-medium">{order.customer}</span>
                <span class="text-xs text-muted-foreground">{order.id} · {order.items} item{order.items === 1 ? '' : 's'} · ${order.total}</span>
              </span>
              <Badge variant={tone[order.status]}>{order.status}</Badge>
            </Button>
          </li>
        {/each}
      </ul>
    {:else}
      <EmptyState size="sm" title={`${tabTitle} is a placeholder`} description="Orders has the live list.">
        {#snippet action()}
          <Button size="sm" variant="outline" onclick={() => (tab = '#demo/mobile/orders')}>Go to Orders</Button>
        {/snippet}
      </EmptyState>
    {/if}
  </div>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div onclick={(event) => interceptDemoNav(event, (href) => (tab = href))}>
    <BottomNav items={tabs} fixed={false} label="App tabs" />
  </div>
</div>

<BottomSheet
  bind:open={sheetOpen}
  title={selected ? `Order ${selected.id}` : 'Order'}
  description={selected ? `${selected.customer} · $${selected.total}` : undefined}
>
  {#if selected}
    <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 py-2 text-left">
      <dt class="text-muted-foreground">Status</dt>
      <dd><Badge variant={tone[selected.status]}>{selected.status}</Badge></dd>
      <dt class="text-muted-foreground">Items</dt>
      <dd>{selected.items}</dd>
    </dl>
  {/if}
  {#snippet footer()}
    {#if selected && NEXT[selected.status]}
      <Button onclick={advance}>Mark as {NEXT[selected.status]?.toLowerCase()}</Button>
    {/if}
    <Button variant="outline" onclick={() => (sheetOpen = false)}>Close</Button>
  {/snippet}
</BottomSheet>
