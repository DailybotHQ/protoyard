<script lang="ts">
import { getRuntime, liveQuery } from '@protoyard/renderer-svelte';
import { Box, Heading, Text } from 'texuli/typography';
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

<section class="space-y-5"><div><Text size="sm" tone="primary" weight="semibold" transform="uppercase" tracking="wide">Your activity</Text><Heading level={1} size="xl" class="mt-2">Orders & payouts</Heading><Text tone="muted" class="mt-2">Paid orders create a simulated pending seller payout. Values are integer cents.</Text></div>
  {#if orders.loading}<Text role="status">Loading orders…</Text>{:else if !(orders.current?.length)}<Box border="default" radius="xl" padding="xl"><Text tone="muted" align="center">No orders yet. Try a simulated checkout from the marketplace.</Text></Box>{:else}
    <ul class="space-y-3">{#each orders.current as order (order.id)}<li><Box surface="default" border="default" radius="xl" padding="md" class="grid gap-2 sm:grid-cols-4 sm:items-center"><div><Text weight="medium">{order.id}</Text><Text size="xs" tone="muted" tabular>{order.quantity} × ${(order.unitPriceCents / 100).toFixed(2)}</Text></div><Text size="sm">{order.status === 'paid' ? 'Paid (simulated)' : 'Declined'}</Text><Text size="sm" tabular>Total ${(order.totalCents / 100).toFixed(2)}</Text><Text size="sm" weight="medium" tabular>Seller payout ${(order.sellerPayoutCents / 100).toFixed(2)}</Text></Box></li>{/each}</ul>
  {/if}
</section>
