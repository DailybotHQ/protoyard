<script lang="ts">
import {
  getRuntime,
  liveQuery,
  navigate,
  type RouteProps,
  runService,
} from '@protoyard/renderer-svelte';
import { Button } from '@protoyard/ui';
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

<section class="mx-auto max-w-xl rounded-xl border border-border bg-surface p-6">
  <p class="text-sm font-semibold uppercase tracking-wide text-primary">Simulated checkout</p>
  {#if listing.loading}<p role="status" class="mt-4">Loading listing…</p>{:else if !listing.current}<p class="mt-4" role="alert">This listing is no longer available.</p>{:else}
    <h1 class="mt-2 text-2xl font-semibold">{listing.current.title}</h1><p class="mt-2 text-muted-foreground">{listing.current.description}</p>
    <form class="mt-6 space-y-4" onsubmit={checkout}>
      <label class="block text-sm">Quantity<input class="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2" type="number" min={1} max={20} step={1} bind:value={quantity} required /></label>
      <label class="block text-sm">Test result<select class="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2" bind:value={outcome}><option value="success">Approve simulated checkout</option><option value="declined">Decline simulated checkout</option></select></label>
      <p class="font-semibold">Total: ${((listing.current.priceCents * quantity) / 100).toFixed(2)}</p>
      <p class="text-xs text-muted-foreground">No card details are requested. This local simulation creates a payout record on success.</p>
      <Button disabled={busy} loading={busy} loadingLabel="Processing simulation">Place simulated order</Button>
    </form>
  {/if}
  {#if message}<p role="status" class="mt-4 rounded-md bg-primary/5 p-3 text-sm">{message} <button class="ml-2 underline" onclick={() => navigate('/orders')}>View orders</button></p>{/if}
</section>
