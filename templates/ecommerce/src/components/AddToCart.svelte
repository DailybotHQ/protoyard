<script lang="ts">
import { ShoppingCart } from '@lucide/svelte';
import { can, isValidationError, runService } from '@protoyard/renderer-svelte';
import { Button, toast } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import type { Product } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useShop } from '../lib/context.ts';

/**
 * Add-to-cart that respects stock and permissions. Guests (viewers) see a
 * disabled button with the reason; stock limits come back from the service.
 */
let {
  product,
  quantity = 1,
  size = 'md',
  class: className = '',
  full = false,
}: {
  product: Product;
  quantity?: number;
  size?: 'sm' | 'md' | 'lg';
  class?: string;
  full?: boolean;
} = $props();

const { services } = useShop();
let adding = $state(false);
const allowed = $derived(can(CAPABILITIES.cart));
const soldOut = $derived(product.stock <= 0);

async function add() {
  adding = true;
  const result = await runService(() => services.cart.add(product.id, quantity), {
    success: { title: 'Added to cart', description: `${quantity} × ${product.name}` },
  });
  adding = false;
  if (!result.ok && isValidationError(result.error)) {
    toast.error('Could not add to cart', { description: Object.values(result.error.issues)[0] });
  }
}
</script>

{#if !allowed}
  <Button {size} variant="outline" disabled class={[full && 'w-full', className]} title="Guests can browse. Switch to a customer persona in DevTools to shop.">
    Sign in to buy
  </Button>
{:else}
  <Button
    {size}
    class={[full && 'w-full', className]}
    disabled={soldOut}
    loading={adding}
    onclick={add}
  >
    {#if !soldOut}<LucideIcon icon={ShoppingCart} class="size-4" />{/if}
    <!-- The visible words start the name (WCAG 2.5.3); the product is for screen readers. -->
    {soldOut ? 'Sold out' : 'Add to cart'}<span class="sr-only">: {product.name}</span>
  </Button>
{/if}
