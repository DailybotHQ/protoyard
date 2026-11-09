<script lang="ts">
import { PackageSearch, Search, SlidersHorizontal, Star, Truck } from '@lucide/svelte';
import { Link, liveQuery } from '@protoyard/renderer-svelte';
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  Input,
  Select,
  Skeleton,
} from '@protoyard/ui';
import { Chip } from 'texuli/badge';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import { InputGroup } from 'texuli/input';
import { Box, Heading, Text } from 'texuli/typography';
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
    <legend><Text as="span" size="sm" weight="semibold">Price</Text></legend>
    <div class="flex items-center gap-2">
      <label class="sr-only" for="min-price">Minimum price in dollars</label>
      <Input id="min-price" inputmode="decimal" placeholder="Min $" bind:value={minPrice} aria-invalid={priceError ? true : undefined} aria-describedby={priceError ? 'price-error' : undefined} />
      <Text as="span" tone="muted" aria-hidden="true">–</Text>
      <label class="sr-only" for="max-price">Maximum price in dollars</label>
      <Input id="max-price" inputmode="decimal" placeholder="Max $" bind:value={maxPrice} aria-invalid={priceError ? true : undefined} aria-describedby={priceError ? 'price-error' : undefined} />
    </div>
    {#if priceError}<Text id="price-error" size="xs" tone="destructive" role="alert">{priceError}</Text>{/if}
    <div class="flex flex-wrap gap-1.5">
      {#each [['', '25'], ['25', '50'], ['50', '100'], ['100', '']] as [lo, hi] (`${lo}-${hi}`)}
        <Chip
          label={lo ? (hi ? `$${lo}–$${hi}` : `$${lo}+`) : `Under $${hi}`}
          selected={minPrice === (lo ?? '') && maxPrice === (hi ?? '')}
          onclick={() => {
            minPrice = lo ?? '';
            maxPrice = hi ?? '';
          }}
        />
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

<Box as="section" surface="subtle" border="default" radius="xl" padding="lg" class="mb-6 overflow-hidden sm:p-8">
  <Heading level={1} size="xl">Small goods, made to last.</Heading>
  <Text tone="muted" class="mt-2 max-w-xl">
    Bags, desk companions and everyday gear from independent makers.
  </Text>
  <Text size="sm" weight="medium" class="mt-4 inline-flex items-center gap-2">
    <LucideIcon icon={Truck} tone="primary" class="size-4" />Free standard shipping over {money(FREE_SHIPPING_THRESHOLD_CENTS)}
  </Text>
</Box>

<div class="mb-5 flex flex-wrap gap-2" role="group" aria-label="Categories">
  {#each [{ id: '', name: 'All' } as Pick<Category, 'id' | 'name'>, ...(categories.current ?? [])] as category (category.id)}
    <Button
      type="button"
      variant={categoryId === category.id ? 'default' : 'outline'}
      size="sm"
      aria-pressed={categoryId === category.id}
      onclick={() => (categoryId = category.id)}
      class="min-h-touch px-4 sm:min-h-0"
    >
      {category.name}
    </Button>
  {/each}
</div>

<div class="flex gap-6">
  <aside class="hidden w-56 shrink-0 lg:block" aria-label="Filters">
    <Box surface="default" border="default" radius="xl" padding="md" class="sticky top-24">{@render filterPanel()}</Box>
  </aside>

  <div class="min-w-0 flex-1">
    <div class="mb-4 flex flex-wrap items-center gap-2" role="search">
      <InputGroup
        class="min-w-0 flex-1 basis-56"
        inputProps={{ type: 'search', placeholder: 'Search products…', 'aria-label': 'Search products' }}
        bind:value={query}
      >
        {#snippet start()}<Icon icon="search" class="size-4" aria-hidden="true" />{/snippet}
      </InputGroup>
      <Select
        aria-label="Sort products"
        class="w-full sm:w-48"
        items={Object.entries(SORTS).map(([value, label]) => ({ value, label }))}
        bind:value={sort}
      />
      <Button variant="outline" class="lg:hidden" aria-expanded={filtersOpen} aria-controls="mobile-filters" onclick={() => (filtersOpen = !filtersOpen)}>
        <LucideIcon icon={SlidersHorizontal} class="size-4" />Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
      </Button>
    </div>
    {#if filtersOpen}
      <Box id="mobile-filters" surface="default" border="default" radius="xl" padding="md" class="mb-4 lg:hidden">{@render filterPanel()}</Box>
    {/if}

    <Text size="sm" tone="muted" class="mb-3" aria-live="polite">
      {visible.length} product{visible.length === 1 ? '' : 's'}{filtering ? ' match your filters' : ''}
    </Text>

    {#if products.loading}
      <div class="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-label="Loading products">
        {#each [0, 1, 2, 3, 4, 5, 6, 7] as i (i)}<Skeleton class="h-80 w-full" />{/each}
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
          <li class="flex">
            <Card class="relative flex w-full flex-col overflow-hidden">
            <ProductArt hue={product.hue} category={slugOf(product.categoryId)} name={product.name} soldOut={product.stock <= 0} class="aspect-square" />
            <div class="flex flex-1 flex-col gap-1.5 p-3 sm:p-4">
              <Text size="xs" tone="muted">{categoryName(product.categoryId)}</Text>
              <Heading level={2} size="sm">
                <Link href={`/products/${product.id}`} class="after:absolute after:inset-0">{product.name}</Link>
              </Heading>
              <Text size="xs" tone="muted" class="flex items-center gap-1">
                <Icon icon={Star} tone="warning" fill="currentColor" class="size-3" aria-hidden="true" />{product.rating.toFixed(1)}
                <span>({product.reviewCount})</span>
              </Text>
              <div class="mt-auto flex flex-wrap items-center gap-2 pt-1">
                <Price cents={product.priceCents} compareAt={product.compareAtCents} />
                <StockBadge {product} />
              </div>
              <div class="relative z-10 pt-2">
                <AddToCart {product} size="sm" full />
              </div>
            </div>
            </Card>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
