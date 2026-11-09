<script lang="ts">
import { getRuntime, liveQuery, runService, usePrincipal } from '@protoyard/renderer-svelte';
import { Button, Input, Textarea } from '@protoyard/ui';
import { Box, Heading, Text } from 'texuli/typography';
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
  <Box as="section" surface="default" border="default" radius="xl" padding="lg" class="mx-auto max-w-2xl"><Heading level={1} size="xl">Open your seller studio</Heading><Text tone="muted" class="mt-2">Complete the short setup wizard to publish listings and receive simulated payout notices.</Text><Button class="mt-5" href="#/seller/onboarding">Start seller onboarding</Button></Box>
{:else}
  <section class="space-y-7">
    <div><Text size="sm" tone="primary" weight="semibold" transform="uppercase" tracking="wide">Seller studio</Text><Heading level={1} size="xl" class="mt-2">{profile.current.storeName}</Heading><Text tone="muted" class="mt-2">{profile.current.bio}</Text></div>
    <Box surface="default" border="default" radius="xl" padding="md"><form class="grid gap-3 md:grid-cols-2" onsubmit={(event) => { event.preventDefault(); void publish(); }}>
      <Input aria-label="Listing title" placeholder="Listing title" bind:value={title} required minlength={3} maxlength={100} />
      <Input aria-label="Category" placeholder="Category" bind:value={category} required maxlength={40} />
      <Textarea class="md:col-span-2" aria-label="Description" placeholder="Describe your listing" bind:value={description} required minlength={10} maxlength={1000} />
      <Text as="label" size="sm" class="flex items-center gap-2">Price (USD)<Input class="max-w-40" type="number" min={0.5} step={0.01} bind:value={price} required /></Text>
      <Button class="md:justify-self-end" disabled={busy} loading={busy} loadingLabel="Publishing listing">Publish listing</Button>
    </form></Box>
    {#if message}<Text role="status" size="sm" tone="muted">{message}</Text>{/if}
    <ul class="grid gap-3 sm:grid-cols-2">{#each listings.current ?? [] as listing (listing.id)}<li><Box surface="default" border="default" radius="xl" padding="md" class="flex items-start justify-between gap-4"><div><Heading level={2} size="sm">{listing.title}</Heading><Text size="sm" tone="muted" class="mt-1">{listing.category} · ${(listing.priceCents / 100).toFixed(2)} · {listing.status}</Text></div><Button variant="outline" size="sm" onclick={() => remove(listing.id)}>Remove</Button></Box></li>{/each}</ul>
  </section>
{/if}
