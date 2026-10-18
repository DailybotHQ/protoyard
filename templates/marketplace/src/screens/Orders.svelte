<script lang="ts">
import { getRuntime, liveQuery } from '@protoyard/renderer-svelte';
import type { MarketplaceDatabase } from '../database/schema.ts';

const runtime = getRuntime<MarketplaceDatabase>();
const personaId = () => runtime.session.principal()?.persona.id ?? '';
const orders = liveQuery(
  async () => {
    const id = personaId();
    if (!id) return [];
    const [buyer, seller] = await Promise.all([
      runtime.db.marketplace_orders.where('buyerPersonaId').equals(id).toArray(),
      runtime.db.marketplace_orders.where('sellerPersonaId').equals(id).toArray(),
    ]);
    return [...new Map([...buyer, ...seller].map((order) => [order.id, order])).values()];
  },
  { initial: [], deps: personaId }
);
</script>

<section class="space-y-5"><div><p class="text-sm font-semibold uppercase tracking-wide text-primary">Your activity</p><h1 class="mt-2 text-3xl font-semibold">Orders & payouts</h1><p class="mt-2 text-muted-foreground">Paid orders create a simulated pending seller payout. Values are integer cents.</p></div>
  {#if orders.loading}<p role="status">Loading orders…</p>{:else if !(orders.current?.length)}<p class="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">No orders yet. Try a simulated checkout from the marketplace.</p>{:else}
    <ul class="space-y-3">{#each orders.current as order (order.id)}<li class="grid gap-2 rounded-xl border border-border bg-surface p-4 sm:grid-cols-4 sm:items-center"><div><p class="font-medium">{order.id}</p><p class="text-xs text-muted-foreground">{order.quantity} × ${(order.unitPriceCents / 100).toFixed(2)}</p></div><p class="text-sm">{order.status === 'paid' ? 'Paid (simulated)' : 'Declined'}</p><p class="text-sm">Total ${(order.totalCents / 100).toFixed(2)}</p><p class="text-sm font-medium">Seller payout ${(order.sellerPayoutCents / 100).toFixed(2)}</p></li>{/each}</ul>
  {/if}
</section>
