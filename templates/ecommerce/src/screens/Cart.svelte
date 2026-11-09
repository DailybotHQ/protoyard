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
import {
  AlertDialog,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Notice,
  Skeleton,
  toast,
} from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Heading, Text } from 'texuli/typography';
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
      <Button variant="ghost" tone="destructive" onclick={() => (confirmClear = true)}>
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
  <div class="space-y-3" aria-busy="true" aria-label="Loading cart">{#each [0, 1] as i (i)}<Skeleton class="h-24 w-full" />{/each}</div>
{:else if lines.error}
  <ErrorState title="Could not load your cart" message={String(lines.error)} />
{:else if (lines.current?.length ?? 0) === 0}
  <EmptyState icon={ShoppingCart} title="Your cart is empty" description="Items you add stay here, even after a reload.">
    {#snippet action()}<Button href="#/">Start shopping</Button>{/snippet}
  </EmptyState>
{:else}
  <div class="grid gap-6 lg:grid-cols-3">
    <div class="space-y-3 lg:col-span-2">
      {#if problems.length > 0}
        <Notice tone="warning" role="alert" text="Some items sold out while they were in your cart. Lower the highlighted quantities — checkout will refuse the order until they fit the stock." />
      {/if}
      <Box surface="default" border="default" radius="xl" padding="none" class="overflow-hidden">
      <ul>
        {#each lines.current ?? [] as line, index (line.id)}
          {@const over = line.quantity > line.product.stock}
          <li>
          <Box border={index > 0 ? 'block-start' : 'none'} surface={over ? 'muted' : 'transparent'} radius="none" padding="none" class="flex gap-3 p-3 sm:gap-4 sm:p-4">
            <ProductArt hue={line.product.hue} category={line.categorySlug} name={line.product.name} size="sm" radius="lg" soldOut={line.product.stock <= 0} class="size-20 shrink-0" />
            <div class="flex min-w-0 flex-1 flex-col gap-2">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <Text weight="medium"><Link href={`/products/${line.productId}`}>{line.product.name}</Link></Text>
                  <Text size="sm" tone="muted" tabular>{money(line.product.priceCents)} each</Text>
                </div>
                <Text weight="semibold" tabular>{money(line.product.priceCents * line.quantity)}</Text>
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
                <Text size="sm" weight="medium" tone="destructive">
                  {line.product.stock === 0 ? 'Sold out — remove it to check out.' : `Only ${line.product.stock} left — lower the quantity.`}
                </Text>
              {/if}
            </div>
          </Box>
          </li>
        {/each}
      </ul>
      </Box>
    </div>

    <Card class="h-fit p-5 lg:sticky lg:top-24">
      <Heading level={2} size="sm">Order summary</Heading>
      <dl class="mt-4 space-y-2">
        <div class="flex justify-between"><dt><Text as="span" size="sm" tone="muted">Subtotal</Text></dt><dd><Text as="span" size="sm" tabular>{money(totals.subtotalCents)}</Text></dd></div>
        <div class="flex justify-between"><dt><Text as="span" size="sm" tone="muted">Standard shipping</Text></dt><dd><Text as="span" size="sm" tabular>{totals.shippingCents ? money(totals.shippingCents) : 'Free'}</Text></dd></div>
        <div class="flex justify-between"><dt><Text as="span" size="sm" tone="muted">Estimated tax</Text></dt><dd><Text as="span" size="sm" tabular>{money(totals.taxCents)}</Text></dd></div>
        <Box border="block-start" radius="none" padding="none" class="flex justify-between pt-2"><dt><Text as="span" weight="semibold">Total</Text></dt><dd><Text as="span" weight="semibold" tabular>{money(totals.totalCents)}</Text></dd></Box>
      </dl>
      {#if toFreeShipping > 0}
        <Text size="xs" tone="muted" class="mt-3">Add {money(toFreeShipping)} more for free standard shipping.</Text>
      {/if}
      <Button class="mt-5 w-full" size="lg" onclick={() => navigate('/checkout')}>Checkout</Button>
      <Text size="xs" tone="muted" align="center" class="mt-3">Demo store — no real payment is taken.</Text>
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
