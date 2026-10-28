<script lang="ts">
import { ArrowLeft, PackageX, Pencil, RotateCcw, ShieldCheck, Star, Truck } from '@lucide/svelte';
import {
  back,
  can,
  Link,
  liveQuery,
  type RouteProps,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import { Button, EmptyState, ErrorState, Skeleton } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import AddToCart from '../components/AddToCart.svelte';
import Price from '../components/Price.svelte';
import ProductArt from '../components/ProductArt.svelte';
import ProductEditDialog from '../components/ProductEditDialog.svelte';
import QuantityStepper from '../components/QuantityStepper.svelte';
import StockBadge from '../components/StockBadge.svelte';
import { FREE_SHIPPING_THRESHOLD_CENTS } from '../domain/catalog.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { MAX_QUANTITY } from '../domain/services.ts';
import { useShop } from '../lib/context.ts';
import { money } from '../lib/format.ts';

let { params }: RouteProps = $props();
const { db } = useShop();
const principal = usePrincipal();

const id = () => params.id ?? '';
const me = $derived(principal.current?.persona.id ?? '');
const product = liveQuery(() => db.products.get(id()), { deps: id });
const category = liveQuery(
  async () => {
    const p = await db.products.get(id());
    return p ? db.categories.get(p.categoryId) : undefined;
  },
  { deps: id }
);
const inCart = liveQuery(async () => (await db.cartItems.get(`${me}:${id()}`))?.quantity ?? 0, {
  initial: 0,
  deps: () => [me, id()],
});

let quantity = $state(1);
let editOpen = $state(false);
const maxQuantity = $derived(
  Math.max(1, Math.min(MAX_QUANTITY, (product.current?.stock ?? 1) - (inCart.current ?? 0)))
);
$effect(() => {
  if (quantity > maxQuantity) quantity = maxQuantity;
});
</script>

<Button variant="ghost" size="sm" class="-ml-2" onclick={() => back('/')}>
  <LucideIcon icon={ArrowLeft} class="size-4" />Back to shop
</Button>

{#if product.loading}
  <div class="mt-6 grid gap-8 md:grid-cols-2"><Skeleton class="aspect-square w-full rounded-2xl" /><Skeleton class="h-64 w-full" /></div>
{:else if product.error}
  <ErrorState class="mt-6" title="Could not load this product" message={String(product.error)} />
{:else if !product.current}
  <EmptyState class="mt-6" icon={PackageX} title="Product not found" description="It may have been removed from the catalog.">
    {#snippet action()}<Button href="#/">Back to shop</Button>{/snippet}
  </EmptyState>
{:else}
  {@const current = product.current}
  <div class="mt-4 grid gap-8 md:grid-cols-2 lg:gap-12">
    <ProductArt hue={current.hue} category={category.current?.slug ?? ''} name={current.name} size="lg" class={`aspect-square rounded-2xl border border-border ${current.stock <= 0 ? 'opacity-60 grayscale' : ''}`} />
    <div class="flex flex-col gap-4">
      <div>
        {#if category.current}<p class="text-sm text-muted-foreground">{category.current.name}</p>{/if}
        <h1 class="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{current.name}</h1>
        <p class="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <LucideIcon icon={Star} class="size-4 fill-current text-warning" />
          <span>{current.rating.toFixed(1)} · {current.reviewCount} reviews</span>
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <Price cents={current.priceCents} compareAt={current.compareAtCents} class="text-2xl" />
        <StockBadge product={current} showInStock />
      </div>
      <p class="text-surface-foreground">{current.description}</p>

      {#if current.stock > 0 && can(CAPABILITIES.cart)}
        <div class="flex flex-wrap items-center gap-3">
          <QuantityStepper label={current.name} value={quantity} max={maxQuantity} onchange={(n) => (quantity = n)} disabled={(inCart.current ?? 0) >= current.stock} />
          <AddToCart product={current} {quantity} size="lg" class="flex-1 sm:flex-none" />
        </div>
      {:else}
        <AddToCart product={current} size="lg" class="w-full sm:w-auto" />
      {/if}
      {#if (inCart.current ?? 0) > 0}
        <p class="text-sm text-muted-foreground">
          {inCart.current} already in your <Link href="/cart" class="font-medium text-primary hover:underline">cart</Link>{(inCart.current ?? 0) >= current.stock ? ' — that is all we have.' : '.'}
        </p>
      {/if}

      <ul class="mt-2 space-y-2 border-t border-border pt-4 text-sm text-muted-foreground">
        <li class="flex items-center gap-2"><LucideIcon icon={Truck} class="size-4" />Free standard shipping over {money(FREE_SHIPPING_THRESHOLD_CENTS)}</li>
        <li class="flex items-center gap-2"><LucideIcon icon={RotateCcw} class="size-4" />Cancel any time before it ships</li>
        <li class="flex items-center gap-2"><LucideIcon icon={ShieldCheck} class="size-4" />Demo store — no real payment is ever taken</li>
      </ul>

      {#if can(CAPABILITIES.productsManage)}
        <div class="rounded-lg border border-dashed border-border p-3 text-sm">
          <p class="font-medium">Admin</p>
          <p class="mt-0.5 text-muted-foreground">Stock: {current.stock} units</p>
          <Button variant="outline" size="sm" class="mt-2" onclick={() => (editOpen = true)}>
            <LucideIcon icon={Pencil} class="size-4" />Edit price & stock
          </Button>
        </div>
      {/if}
    </div>
  </div>
  <ProductEditDialog bind:open={editOpen} product={current} />
{/if}
