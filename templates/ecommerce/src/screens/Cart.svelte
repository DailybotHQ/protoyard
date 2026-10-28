<script lang="ts">
import { ShoppingCart, Trash2, UserRound } from '@lucide/svelte';
import {
  can,
  Link,
  liveQuery,
  navigate,
  runService,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import { AlertDialog, Button, Card, EmptyState, ErrorState, Skeleton, toast } from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import PageHeader from '../components/PageHeader.svelte';
import ProductArt from '../components/ProductArt.svelte';
import QuantityStepper from '../components/QuantityStepper.svelte';
import { computeTotals, FREE_SHIPPING_THRESHOLD_CENTS } from '../domain/catalog.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { MAX_QUANTITY } from '../domain/services.ts';
import { cartLines } from '../lib/cart.ts';
import { useShop } from '../lib/context.ts';
import { money } from '../lib/format.ts';

const { db, services } = useShop();
const principal = usePrincipal();
const me = $derived(principal.current?.persona.id ?? '');
const lines = liveQuery(() => cartLines(db, me), { initial: [], deps: () => me });

let confirmClear = $state(false);
const totals = $derived(
  computeTotals(
    (lines.current ?? []).map((l) => ({
      unitPriceCents: l.product.priceCents,
      quantity: l.quantity,
    })),
    'standard'
  )
);
const problems = $derived((lines.current ?? []).filter((l) => l.quantity > l.product.stock));
const toFreeShipping = $derived(FREE_SHIPPING_THRESHOLD_CENTS - totals.subtotalCents);

async function setQuantity(productId: string, quantity: number) {
  const result = await runService(() => services.cart.setQuantity(productId, quantity));
  if (!result.ok && result.error instanceof Error && 'issues' in result.error) {
    toast.error('Could not update quantity', { description: result.error.message });
  }
}
</script>

<PageHeader title="Your cart" description={totals.itemCount ? `${totals.itemCount} item${totals.itemCount === 1 ? '' : 's'} · saved in this browser` : undefined}>
  {#snippet actions()}
    {#if (lines.current?.length ?? 0) > 0}
      <Button variant="ghost" class="text-destructive hover:bg-destructive/10" onclick={() => (confirmClear = true)}>
        <LucideIcon icon={Trash2} class="size-4" />Clear cart
      </Button>
    {/if}
  {/snippet}
</PageHeader>

{#if !can(CAPABILITIES.cart)}
  <EmptyState icon={UserRound} title="Guests don't have a cart" description="You can browse everything. Switch to the customer persona (Chloe) in DevTools to shop and check out.">
    {#snippet action()}<Button href="#/">Keep browsing</Button>{/snippet}
  </EmptyState>
{:else if lines.loading}
  <div class="space-y-3" aria-busy="true" aria-label="Loading cart">{#each [0, 1] as i (i)}<Skeleton class="h-24 w-full rounded-xl" />{/each}</div>
{:else if lines.error}
  <ErrorState title="Could not load your cart" message={String(lines.error)} />
{:else if (lines.current?.length ?? 0) === 0}
  <EmptyState icon={ShoppingCart} title="Your cart is empty" description="Items you add stay here, even after a reload.">
    {#snippet action()}<Button href="#/">Start shopping</Button>{/snippet}
  </EmptyState>
{:else}
  <div class="grid gap-6 lg:grid-cols-[1fr_22rem]">
    <div class="space-y-3">
      {#if problems.length > 0}
        <div class="flex gap-3 rounded-xl border border-warning/50 bg-warning/10 p-4 text-sm" role="alert">
          <Icon icon="warning" class="mt-0.5 size-4 shrink-0 text-warning-foreground dark:text-warning" aria-hidden="true" />
          <p>Some items sold out while they were in your cart. Lower the highlighted quantities — checkout will refuse the order until they fit the stock.</p>
        </div>
      {/if}
      <ul class="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {#each lines.current ?? [] as line (line.id)}
          {@const over = line.quantity > line.product.stock}
          <li class={['flex gap-3 p-3 sm:gap-4 sm:p-4', over && 'bg-destructive/5']}>
            <ProductArt hue={line.product.hue} category={line.categorySlug} name={line.product.name} size="sm" class="size-20 shrink-0 rounded-lg" />
            <div class="flex min-w-0 flex-1 flex-col gap-2">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <Link href={`/products/${line.productId}`} class="font-medium hover:text-primary">{line.product.name}</Link>
                  <p class="text-sm text-muted-foreground tabular-nums">{money(line.product.priceCents)} each</p>
                </div>
                <p class="font-semibold tabular-nums">{money(line.product.priceCents * line.quantity)}</p>
              </div>
              <div class="flex flex-wrap items-center gap-3">
                <QuantityStepper
                  label={line.product.name}
                  value={line.quantity}
                  max={Math.max(line.quantity, Math.min(MAX_QUANTITY, line.product.stock))}
                  onchange={(n) => setQuantity(line.productId, n)}
                />
                <Button variant="ghost" size="sm" onclick={() => runService(() => services.cart.remove(line.productId), { success: 'Removed from cart' })}>
                  Remove<span class="sr-only"> {line.product.name}</span>
                </Button>
              </div>
              {#if over}
                <p class="text-sm font-medium text-destructive">
                  {line.product.stock === 0 ? 'Sold out — remove it to check out.' : `Only ${line.product.stock} left — lower the quantity.`}
                </p>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    </div>

    <Card class="h-fit p-5 lg:sticky lg:top-24">
      <h2 class="font-semibold">Order summary</h2>
      <dl class="mt-4 space-y-2 text-sm">
        <div class="flex justify-between"><dt class="text-muted-foreground">Subtotal</dt><dd class="tabular-nums">{money(totals.subtotalCents)}</dd></div>
        <div class="flex justify-between"><dt class="text-muted-foreground">Standard shipping</dt><dd class="tabular-nums">{totals.shippingCents ? money(totals.shippingCents) : 'Free'}</dd></div>
        <div class="flex justify-between"><dt class="text-muted-foreground">Estimated tax</dt><dd class="tabular-nums">{money(totals.taxCents)}</dd></div>
        <div class="flex justify-between border-t border-border pt-2 text-base font-semibold"><dt>Total</dt><dd class="tabular-nums">{money(totals.totalCents)}</dd></div>
      </dl>
      {#if toFreeShipping > 0}
        <p class="mt-3 text-xs text-muted-foreground">Add {money(toFreeShipping)} more for free standard shipping.</p>
      {/if}
      <Button class="mt-5 w-full" size="lg" onclick={() => navigate('/checkout')}>Checkout</Button>
      <p class="mt-3 text-center text-xs text-muted-foreground">Demo store — no real payment is taken.</p>
    </Card>
  </div>
{/if}

<AlertDialog
  bind:open={confirmClear}
  destructive
  title="Clear your cart?"
  description="Every item is removed from your cart. Products stay in stock for others."
  confirmLabel="Clear cart"
  onConfirm={async () => {
    const result = await runService(() => services.cart.clear(), { success: 'Cart cleared' });
    if (!result.ok) throw new Error('The cart was not cleared.');
  }}
/>
