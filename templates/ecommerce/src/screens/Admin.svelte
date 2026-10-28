<script lang="ts">
import { Boxes, DollarSign, PackageOpen, Pencil, ShieldOff, TriangleAlert } from '@lucide/svelte';
import { can, Link, liveQuery } from '@protoyard/renderer-svelte';
import {
  Button,
  DataTable,
  type DataTableColumn,
  EmptyState,
  ErrorState,
  Select,
  StatCard,
} from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import PageHeader from '../components/PageHeader.svelte';
import ProductEditDialog from '../components/ProductEditDialog.svelte';
import StockBadge from '../components/StockBadge.svelte';
import type { Product } from '../database/schema.ts';
import { stockState } from '../domain/catalog.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useShop } from '../lib/context.ts';
import { money } from '../lib/format.ts';

type Row = Product & { categoryName: string };

const { db } = useShop();
const rows = liveQuery(
  async (): Promise<Row[]> => {
    const [products, categories] = await Promise.all([
      db.products.toArray(),
      db.categories.toArray(),
    ]);
    const names = new Map(categories.map((c) => [c.id, c.name]));
    return products.map((p) => ({ ...p, categoryName: names.get(p.categoryId) ?? '—' }));
  },
  { initial: [] }
);
const orders = liveQuery(() => db.orders.toArray(), { initial: [] });

let stockFilter = $state('');
let editing = $state<Product | null>(null);
let editOpen = $state(false);

const filtered = $derived(
  (rows.current ?? []).filter((p) => !stockFilter || stockState(p) === stockFilter)
);
const stats = $derived.by(() => {
  const products = rows.current ?? [];
  const live = (orders.current ?? []).filter((o) => o.status !== 'cancelled');
  return {
    low: products.filter((p) => stockState(p) === 'low').length,
    soldOut: products.filter((p) => stockState(p) === 'sold-out').length,
    units: products.reduce((sum, p) => sum + p.stock, 0),
    revenue: live.reduce((sum, o) => sum + o.totalCents, 0),
    open: live.filter((o) => o.status === 'placed' || o.status === 'processing').length,
  };
});

const columns: DataTableColumn<Row>[] = [
  { key: 'name', header: 'Product', sortable: true, cell: nameCell },
  { key: 'categoryName', header: 'Category', sortable: true, hideBelow: 'md' },
  { key: 'priceCents', header: 'Price', sortable: true, align: 'right', cell: priceCell },
  { key: 'stock', header: 'Stock', sortable: true, align: 'right', cell: stockCell },
  { key: 'actions', header: 'Actions', align: 'right', cell: actionsCell },
];

function edit(product: Product) {
  editing = product;
  editOpen = true;
}
</script>

{#snippet nameCell(p: Row)}
  <Link href={`/products/${p.id}`} class="font-medium hover:text-primary">{p.name}</Link>
{/snippet}
{#snippet priceCell(p: Row)}
  <span class="tabular-nums">{money(p.priceCents)}</span>
  {#if p.compareAtCents}<s class="ml-1 text-xs text-muted-foreground">{money(p.compareAtCents)}</s>{/if}
{/snippet}
{#snippet stockCell(p: Row)}
  <span class="inline-flex items-center justify-end gap-2"><span class="tabular-nums">{p.stock}</span><StockBadge product={p} /></span>
{/snippet}
{#snippet actionsCell(p: Row)}
  <Button variant="ghost" size="sm" onclick={(event: MouseEvent) => { event.stopPropagation(); edit(p); }}>
    <LucideIcon icon={Pencil} class="size-4" />Edit<span class="sr-only"> {p.name}</span>
  </Button>
{/snippet}

<PageHeader title="Store admin" description="Edit prices and stock. Changes show up in the storefront immediately." />

{#if !can(CAPABILITIES.productsManage)}
  <EmptyState icon={ShieldOff} title="Admins only" description="Switch to the store admin or owner persona in DevTools to manage products.">
    {#snippet action()}<Button href="#/">Back to shop</Button>{/snippet}
  </EmptyState>
{:else if rows.error}
  <ErrorState title="Could not load products" message={String(rows.error)} />
{:else}
  <section aria-label="Store summary" class="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
    <StatCard label="Units in stock" value={stats.units.toLocaleString('en-US')} icon={Boxes} />
    <StatCard label="Low stock" value={stats.low} icon={TriangleAlert} hint="5 units or fewer" />
    <StatCard label="Sold out" value={stats.soldOut} icon={PackageOpen} />
    <StatCard label="Revenue (all time)" value={money(stats.revenue)} icon={DollarSign} hint={`${stats.open} open orders`} />
  </section>

  <DataTable
    {columns}
    rows={filtered}
    getRowId={(p) => p.id}
    searchKeys={['name', 'categoryName']}
    searchPlaceholder="Search products…"
    pageSize={12}
    loading={rows.loading}
    emptyTitle="No products match"
    sort={{ key: 'stock', direction: 'asc' }}
    caption="Products"
  >
    {#snippet filters()}
      <Select
        aria-label="Filter by stock"
        class="w-40"
        items={[
          { value: '', label: 'All stock levels' },
          { value: 'low', label: 'Low stock' },
          { value: 'sold-out', label: 'Sold out' },
          { value: 'in-stock', label: 'Healthy stock' },
        ]}
        bind:value={stockFilter}
      />
    {/snippet}
    {#snippet toolbar()}
      <Button variant="outline" href="#/orders">View orders</Button>
    {/snippet}
  </DataTable>
{/if}

<ProductEditDialog bind:open={editOpen} product={editing} />
