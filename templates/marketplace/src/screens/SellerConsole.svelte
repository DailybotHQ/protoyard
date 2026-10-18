<script lang="ts">
import { getRuntime, liveQuery, runService, usePrincipal } from '@protoyard/renderer-svelte';
import { Button, Input, Textarea } from '@protoyard/ui';
import type { MarketplaceDatabase } from '../database/schema.ts';
import { createMarketplaceServices } from '../domain/services.ts';

const runtime = getRuntime<MarketplaceDatabase>();
const principal = usePrincipal(runtime);
const services = createMarketplaceServices(runtime);
const personaId = $derived(principal.current?.persona.id ?? '');
const profile = liveQuery(
  () => (personaId ? runtime.db.seller_profiles.get(personaId) : undefined),
  { deps: () => personaId }
);
const listings = liveQuery(
  () => (personaId ? runtime.db.listings.where('sellerPersonaId').equals(personaId).toArray() : []),
  { initial: [], deps: () => personaId }
);
let title = $state('');
let description = $state('');
let category = $state('Home');
let price = $state('');
let message = $state('');
let busy = $state(false);

async function publish() {
  const cents = Math.round(Number(price) * 100);
  if (!Number.isFinite(cents) || cents < 50) {
    message = 'Enter a price of at least $0.50.';
    return;
  }
  busy = true;
  const result = await runService(() =>
    services.createListing({ title, description, category, priceCents: cents })
  );
  busy = false;
  if (result.ok) {
    title = '';
    description = '';
    price = '';
    message = 'Listing published.';
  } else
    message = result.error instanceof Error ? result.error.message : 'Could not publish listing.';
}

async function remove(id: string) {
  const result = await runService(() => services.removeListing(id));
  message = result.ok
    ? 'Listing removed from the storefront.'
    : result.error instanceof Error
      ? result.error.message
      : 'Could not remove listing.';
}
</script>

{#if !profile.current}
  <section class="mx-auto max-w-2xl rounded-xl border border-border bg-surface p-6"><h1 class="text-2xl font-semibold">Open your seller studio</h1><p class="mt-2 text-muted-foreground">Complete the short setup wizard to publish listings and receive simulated payout notices.</p><a class="mt-5 inline-block rounded-md bg-primary px-4 py-2 text-primary-foreground" href="#/seller/onboarding">Start seller onboarding</a></section>
{:else}
  <section class="space-y-7">
    <div><p class="text-sm font-semibold uppercase tracking-wide text-primary">Seller studio</p><h1 class="mt-2 text-3xl font-semibold tracking-tight">{profile.current.storeName}</h1><p class="mt-2 text-muted-foreground">{profile.current.bio}</p></div>
    <form class="grid gap-3 rounded-xl border border-border bg-surface p-4 md:grid-cols-2" onsubmit={(event) => { event.preventDefault(); void publish(); }}>
      <Input aria-label="Listing title" placeholder="Listing title" bind:value={title} required minlength={3} maxlength={100} />
      <Input aria-label="Category" placeholder="Category" bind:value={category} required maxlength={40} />
      <Textarea class="md:col-span-2" aria-label="Description" placeholder="Describe your listing" bind:value={description} required minlength={10} maxlength={1000} />
      <label class="flex items-center gap-2 text-sm">Price (USD)<Input class="max-w-40" type="number" min={0.5} step={0.01} bind:value={price} required /></label>
      <Button class="md:justify-self-end" disabled={busy} loading={busy} loadingLabel="Publishing listing">Publish listing</Button>
    </form>
    {#if message}<p role="status" class="text-sm text-muted-foreground">{message}</p>{/if}
    <ul class="grid gap-3 sm:grid-cols-2">{#each listings.current ?? [] as listing (listing.id)}<li class="flex items-start justify-between gap-4 rounded-xl border border-border bg-surface p-4"><div><h2 class="font-semibold">{listing.title}</h2><p class="mt-1 text-sm text-muted-foreground">{listing.category} · ${(listing.priceCents / 100).toFixed(2)} · {listing.status}</p></div><Button variant="outline" size="sm" onclick={() => void remove(listing.id)}>Remove</Button></li>{/each}</ul>
  </section>
{/if}
