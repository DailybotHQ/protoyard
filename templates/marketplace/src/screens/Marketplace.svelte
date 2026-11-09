<script lang="ts">
import type { Persona } from '@protoyard/core';
import { avatarImage, getRuntime, liveQuery, usePrincipal } from '@protoyard/renderer-svelte';
import { SsoButtons } from '@protoyard/saas-ui';
import { Avatar, Button } from '@protoyard/ui';
import { Box, Heading, Text } from 'texuli/typography';
import type { MarketplaceDatabase } from '../database/schema.ts';

const runtime = getRuntime<MarketplaceDatabase>();
const principal = usePrincipal(runtime);
const listings = liveQuery(
  async () =>
    (await runtime.db.listings.toArray())
      .filter((listing) => listing.status === 'active')
      .sort((a, b) => a.title.localeCompare(b.title)),
  { initial: [] }
);
/** Sellers by persona id: the shop name and the maker's face for each listing. */
const sellers = liveQuery(
  async () => {
    const [profiles, people] = await Promise.all([
      runtime.db.seller_profiles.toArray(),
      runtime.db.table('py_personas').toArray() as Promise<Persona[]>,
    ]);
    const byId = new Map(people.map((p) => [p.id, p]));
    return new Map(
      profiles.map((s) => [
        s.personaId,
        {
          store: s.storeName,
          name: byId.get(s.personaId)?.name ?? s.storeName,
          avatar: byId.get(s.personaId)?.avatar,
        },
      ])
    );
  },
  {
    initial: new Map<string, { store: string; name: string; avatar: string | undefined }>(),
    deps: () => [],
  }
);
const isSignedIn = $derived(principal.current !== null);
</script>

<section class="space-y-10">
  {#if !isSignedIn}
    <Box surface="default" radius="xl" elevation="sm" padding="none" class="grid gap-8 p-6 md:grid-cols-3 md:items-center md:p-10">
      <div class="md:col-span-2">
        <Text size="sm" tone="primary" weight="semibold" transform="uppercase" tracking="wide">For makers and curious buyers</Text>
        <Heading level={1} size="display" class="mt-3 max-w-2xl">Good things, made by people who care.</Heading>
        <Text tone="muted" class="mt-4 max-w-xl">Discover independent shops, try a complete buyer journey, or set up a seller studio. Everything is simulated in this browser.</Text>
        <div class="mt-6 flex flex-wrap gap-3"><Button href="#/sign-up">Join the marketplace</Button><Button variant="outline" href="#/seller/onboarding">Start selling</Button></div>
      </div>
      <Box surface="transparent" border="default" radius="lg" padding="md"><Heading level={2} size="sm">Continue with Google</Heading><Text size="sm" tone="muted" class="mb-4 mt-1">Simulated SSO. No provider is contacted.</Text><SsoButtons providers={['google']} scenarios={{ google: { identity: { subject: 'google-user_0001', name: 'Avery Buyer', email: 'buyer@example.com', emailShared: true }, outcome: 'success' } }} /></Box>
    </Box>
  {:else}
    <div class="flex flex-wrap items-end justify-between gap-4"><div><Text size="sm" tone="primary" weight="semibold" transform="uppercase" tracking="wide">Fieldmarket</Text><Heading level={1} size="xl" class="mt-2">Find something special</Heading><Text tone="muted" class="mt-2">Independent makers, thoughtfully made goods.</Text></div><Button variant="outline" href="#/seller/onboarding">Open a seller studio</Button></div>
  {/if}
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {#each listings.current ?? [] as listing (listing.id)}
      {@const seller = sellers.current?.get(listing.sellerPersonaId)}
      <Box as="article" surface="default" border="default" radius="xl" padding="none" class="overflow-hidden">
        <Box surface="muted" radius="none" padding="none" class="grid aspect-video place-items-center" aria-hidden="true"><Text as="span" size="figure" tone="primary">✳</Text></Box>
        <div class="space-y-3 p-4"><Text size="xs" tone="primary" weight="medium" transform="uppercase" tracking="wide">{listing.category}</Text>{#if seller}<div class="flex items-center gap-2" data-listing-seller=""><Avatar name={seller.name} {...avatarImage(seller.avatar)} size="xs" decorative /><Text as="span" size="sm" tone="muted" truncate>{seller.store}</Text></div>{/if}<div><Heading level={2} size="sm">{listing.title}</Heading><Text size="sm" tone="muted" lineClamp={2} class="mt-1">{listing.description}</Text></div><div class="flex items-center justify-between"><Text as="span" weight="semibold" tabular>${(listing.priceCents / 100).toFixed(2)}</Text><Button size="sm" href={`#/checkout/${listing.id}`}>{isSignedIn ? 'Buy' : 'Sign in to buy'}</Button></div></div>
      </Box>
    {/each}
  </div>
</section>
