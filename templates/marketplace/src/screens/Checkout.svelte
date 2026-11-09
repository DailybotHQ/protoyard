<script lang="ts">
import {
  getRuntime,
  liveQuery,
  navigate,
  type RouteProps,
  runService,
} from '@protoyard/renderer-svelte';
import { Button, Input, Select } from '@protoyard/ui';
import { Box, Heading, Text } from 'texuli/typography';
import type { MarketplaceDatabase } from '../database/schema.ts';
import { createMarketplaceServices } from '../domain/services.ts';

let { params }: RouteProps = $props();
const runtime = getRuntime<MarketplaceDatabase>();
const services = createMarketplaceServices(runtime);
const id = () => params.id ?? '';
const listing = liveQuery(() => runtime.db.listings.get(id()), { deps: id });
let quantity = $state(1);
let outcome = $state<'success' | 'declined'>('success');
let message = $state('');
let busy = $state(false);

async function checkout(event: SubmitEvent) {
  event.preventDefault();
  const listingId = listing.current?.id;
  if (!listingId) return;
  busy = true;
  const result = await runService(() => services.checkout({ listingId, quantity, outcome }));
  busy = false;
  if (result.ok) {
    message =
      result.value.status === 'paid'
        ? 'Simulated checkout complete. No real payment was taken.'
        : 'Simulated checkout declined. No payment was taken.';
  } else
    message =
      result.error instanceof Error ? result.error.message : 'Checkout could not be completed.';
}
</script>

<Box as="section" surface="default" border="default" radius="xl" padding="lg" class="mx-auto max-w-xl">
  <Text size="sm" tone="primary" weight="semibold" transform="uppercase" tracking="wide">Simulated checkout</Text>
  {#if listing.loading}<Text role="status" class="mt-4">Loading listing…</Text>{:else if !listing.current}<Text class="mt-4" role="alert">This listing is no longer available.</Text>{:else}
    <Heading level={1} size="xl" class="mt-2">{listing.current.title}</Heading><Text tone="muted" class="mt-2">{listing.current.description}</Text>
    <form class="mt-6 space-y-4" onsubmit={checkout}>
      <Text as="label" size="sm" class="block">Quantity<Input class="mt-1 block w-full" type="number" min={1} max={20} step={1} bind:value={quantity} required /></Text>
      <Text as="label" size="sm" class="block">Test result<Select class="mt-1 block w-full" bind:value={outcome} items={[{ value: 'success', label: 'Approve simulated checkout' }, { value: 'declined', label: 'Decline simulated checkout' }]} /></Text>
      <Text weight="semibold" tabular>Total: ${((listing.current.priceCents * quantity) / 100).toFixed(2)}</Text>
      <Text size="xs" tone="muted">No card details are requested. This local simulation creates a payout record on success.</Text>
      <Button disabled={busy} loading={busy} loadingLabel="Processing simulation">Place simulated order</Button>
    </form>
  {/if}
  {#if message}<Box surface="muted" radius="md" padding="sm" role="status" class="mt-4"><Text as="span" size="sm">{message}</Text> <Button variant="link" class="ml-2" onclick={() => navigate('/orders')}>View orders</Button></Box>{/if}
</Box>
