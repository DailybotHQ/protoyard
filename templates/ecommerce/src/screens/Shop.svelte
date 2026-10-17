<script lang="ts">
import { PackageSearch, Search, SlidersHorizontal, Star, Truck } from '@lucide/svelte';
import { Link, liveQuery } from '@protoyard/renderer-svelte';
import { Button, Checkbox, EmptyState, ErrorState, Input, Select, Skeleton } from '@protoyard/ui';
import AddToCart from '../components/AddToCart.svelte';
import Price from '../components/Price.svelte';
import ProductArt from '../components/ProductArt.svelte';
import StockBadge from '../components/StockBadge.svelte';
import type { Category } from '../database/schema.ts';
import {
  FREE_SHIPPING_THRESHOLD_CENTS,
  filterProducts,
  parseDollars,
  SORTS,
  type SortKey,
} from '../domain/catalog.ts';
import { useShop } from '../lib/context.ts';
import { money } from '../lib/format.ts';

const { db } = useShop();
const products = liveQuery(() => db.products.toArray(), { initial: [] });
const categories = liveQuery(() => db.categories.toArray(), { initial: [] });

let query = $state('');
let categoryId = $state('');
let minPrice = $state('');
let maxPrice = $state('');
let inStockOnly = $state(false);
let sort = $state<SortKey>('featured');
let filtersOpen = $state(false);

const categoryById = $derived(new Map((categories.current ?? []).map((c) => [c.id, c])));
const minCents = $derived(minPrice.trim() ? parseDollars(minPrice) : null);
const maxCents = $derived(maxPrice.trim() ? parseDollars(maxPrice) : null);
const priceError = $derived(
  (minPrice.trim() && minCents === null) || (maxPrice.trim() && maxCents === null)
    ? 'Enter amounts like 25 or 24.99'
    : minCents !== null && maxCents !== null && minCents > maxCents
      ? 'Minimum is higher than maximum'
      : null
);
const visible = $derived(
  filterProducts(products.current ?? [], {
    query,
    categoryId,
    minCents: priceError ? null : minCents,
    maxCents: priceError ? null : maxCents,
    inStockOnly,
    sort,
  })
);
const filtering = $derived(Boolean(query || categoryId || minPrice || maxPrice || inStockOnly));
const activeFilterCount = $derived([minPrice || maxPrice, inStockOnly].filter(Boolean).length);

function clearFilters() {
  query = '';
  categoryId = '';
  minPrice = '';
  maxPrice = '';
  inStockOnly = false;
}

const slugOf = (id: string) => categoryById.get(id)?.slug ?? '';
const categoryName = (id: string) => categoryById.get(id)?.name ?? '';
</script>

{#snippet filterPanel()}
  <fieldset class="space-y-3">
    <legend class="text-sm font-semibold">Price</legend>
    <div class="flex items-center gap-2">
      <label class="sr-only" for="min-price">Minimum price in dollars</label>
      <Input id="min-price" inputmode="decimal" placeholder="Min $" bind:value={minPrice} aria-invalid={priceError ? true : undefined} aria-describedby={priceError ? 'price-error' : undefined} />
      <span class="text-muted-foreground" aria-hidden="true">–</span>
      <label class="sr-only" for="max-price">Maximum price in dollars</label>
      <Input id="max-price" inputmode="decimal" placeholder="Max $" bind:value={maxPrice} aria-invalid={priceError ? true : undefined} aria-describedby={priceError ? 'price-error' : undefined} />
    </div>
    {#if priceError}<p id="price-error" class="text-xs text-destructive" role="alert">{priceError}</p>{/if}
    <div class="flex flex-wrap gap-1.5">
      {#each [['', '25'], ['25', '50'], ['50', '100'], ['100', '']] as [lo, hi] (`${lo}-${hi}`)}
        <button
          type="button"
          class="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
          onclick={() => {
            minPrice = lo ?? '';
            maxPrice = hi ?? '';
          }}
        >
          {lo ? (hi ? `$${lo}–$${hi}` : `$${lo}+`) : `Under $${hi}`}
        </button>
      {/each}
    </div>
  </fieldset>
  <div class="mt-5">
    <Checkbox label="In stock only" bind:checked={inStockOnly} />
  </div>
  {#if filtering}
    <Button variant="link" size="sm" class="mt-4" onclick={clearFilters}>Clear all filters</Button>
  {/if}
{/snippet}

<section class="mb-6 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-surface to-surface p-6 sm:p-8">
  <h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">Small goods, made to last.</h1>
  <p class="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
    Bags, desk companions and everyday gear from independent makers.
  </p>
  <p class="mt-4 inline-flex items-center gap-2 text-sm font-medium">
    <Truck class="size-4 text-primary" aria-hidden="true" />Free standard shipping over {money(FREE_SHIPPING_THRESHOLD_CENTS)}
  </p>
</section>

<div class="mb-5 flex flex-wrap gap-2" role="group" aria-label="Categories">
  {#each [{ id: '', name: 'All' } as Pick<Category, 'id' | 'name'>, ...(categories.current ?? [])] as category (category.id)}
    <button
      type="button"
      aria-pressed={categoryId === category.id}
      onclick={() => (categoryId = category.id)}
      class={[
        'min-h-touch rounded-full border px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring sm:min-h-0',
        categoryId === category.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface hover:bg-muted',
      ]}
    >
      {category.name}
    </button>
  {/each}
</div>

<div class="grid gap-6 lg:grid-cols-[14rem_1fr]">
  <aside class="hidden lg:block" aria-label="Filters">
    <div class="sticky top-24 rounded-xl border border-border bg-surface p-4">{@render filterPanel()}</div>
  </aside>

  <div class="min-w-0">
    <div class="mb-4 flex flex-wrap items-center gap-2" role="search">
      <div class="relative min-w-0 flex-1 basis-56">
        <Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input type="search" class="pl-9" placeholder="Search products…" aria-label="Search products" bind:value={query} />
      </div>
      <Select
        aria-label="Sort products"
        class="w-full sm:w-48"
        items={Object.entries(SORTS).map(([value, label]) => ({ value, label }))}
        bind:value={sort}
      />
      <Button variant="outline" class="lg:hidden" aria-expanded={filtersOpen} aria-controls="mobile-filters" onclick={() => (filtersOpen = !filtersOpen)}>
        <SlidersHorizontal class="size-4" aria-hidden="true" />Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
      </Button>
    </div>
    {#if filtersOpen}
      <div id="mobile-filters" class="mb-4 rounded-xl border border-border bg-surface p-4 lg:hidden">{@render filterPanel()}</div>
    {/if}

    <p class="mb-3 text-sm text-muted-foreground" aria-live="polite">
      {visible.length} product{visible.length === 1 ? '' : 's'}{filtering ? ' match your filters' : ''}
    </p>

    {#if products.loading}
      <div class="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-label="Loading products">
        {#each [0, 1, 2, 3, 4, 5, 6, 7] as i (i)}<Skeleton class="aspect-[3/4] w-full rounded-xl" />{/each}
      </div>
    {:else if products.error}
      <ErrorState title="Could not load the catalog" message={String(products.error)} />
    {:else if visible.length === 0}
      <EmptyState icon={PackageSearch} title="No products match" description="Try another search, category or price range.">
        {#snippet action()}<Button variant="outline" onclick={clearFilters}>Clear filters</Button>{/snippet}
      </EmptyState>
    {:else}
      <ul class="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
        {#each visible as product (product.id)}
          <li class="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-soft transition-shadow hover:shadow-float">
            <ProductArt hue={product.hue} category={slugOf(product.categoryId)} name={product.name} class={['aspect-square', product.stock <= 0 && 'opacity-60 grayscale'].filter(Boolean).join(' ')} />
            <div class="flex flex-1 flex-col gap-1.5 p-3 sm:p-4">
              <p class="text-xs text-muted-foreground">{categoryName(product.categoryId)}</p>
              <h2 class="text-sm leading-snug font-medium">
                <Link href={`/products/${product.id}`} class="after:absolute after:inset-0 hover:text-primary focus-visible:outline-none">{product.name}</Link>
              </h2>
              <p class="flex items-center gap-1 text-xs text-muted-foreground">
                <Star class="size-3 fill-current text-warning" aria-hidden="true" />{product.rating.toFixed(1)}
                <span>({product.reviewCount})</span>
              </p>
              <div class="mt-auto flex flex-wrap items-center gap-2 pt-1">
                <Price cents={product.priceCents} compareAt={product.compareAtCents} />
                <StockBadge {product} />
              </div>
              <div class="relative z-10 pt-2">
                <AddToCart {product} size="sm" full />
              </div>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
