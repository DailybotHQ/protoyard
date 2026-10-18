<script lang="ts">
import { getRuntime, liveQuery, usePrincipal } from '@protoyard/renderer-svelte';
import { SsoButtons } from '@protoyard/saas-ui';
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
const isSignedIn = $derived(principal.current !== null);
</script>

<section class="space-y-10">
  {#if !isSignedIn}
    <div class="grid gap-8 rounded-2xl bg-surface p-6 shadow-soft md:grid-cols-[1fr_20rem] md:items-center md:p-10">
      <div>
        <p class="text-sm font-semibold uppercase tracking-wide text-primary">For makers and curious buyers</p>
        <h1 class="mt-3 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">Good things, made by people who care.</h1>
        <p class="mt-4 max-w-xl text-muted-foreground">Discover independent shops, try a complete buyer journey, or set up a seller studio. Everything is simulated in this browser.</p>
        <div class="mt-6 flex flex-wrap gap-3"><a class="rounded-md bg-primary px-4 py-2 text-primary-foreground" href="#/sign-up">Join the marketplace</a><a class="rounded-md border border-border px-4 py-2" href="#/seller/onboarding">Start selling</a></div>
      </div>
      <div class="rounded-xl border border-border bg-background p-5"><h2 class="font-semibold">Continue with Google</h2><p class="mb-4 mt-1 text-sm text-muted-foreground">Simulated SSO. No provider is contacted.</p><SsoButtons providers={['google']} scenarios={{ google: { identity: { subject: 'google-user_0001', name: 'Avery Buyer', email: 'buyer@example.com', emailShared: true }, outcome: 'success' } }} /></div>
    </div>
  {:else}
    <div class="flex flex-wrap items-end justify-between gap-4"><div><p class="text-sm font-semibold uppercase tracking-wide text-primary">Fieldmarket</p><h1 class="mt-2 text-3xl font-semibold tracking-tight">Find something special</h1><p class="mt-2 text-muted-foreground">Independent makers, thoughtfully made goods.</p></div><a href="#/seller/onboarding" class="rounded-md border border-border px-4 py-2">Open a seller studio</a></div>
  {/if}
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {#each listings.current ?? [] as listing (listing.id)}
      <article class="overflow-hidden rounded-xl border border-border bg-surface">
        <div class="grid aspect-[4/3] place-items-center bg-primary/5 text-5xl" aria-hidden="true">✳</div>
        <div class="space-y-3 p-4"><p class="text-xs font-medium uppercase tracking-wide text-primary">{listing.category}</p><div><h2 class="font-semibold">{listing.title}</h2><p class="mt-1 line-clamp-2 text-sm text-muted-foreground">{listing.description}</p></div><div class="flex items-center justify-between"><span class="font-semibold tabular-nums">${(listing.priceCents / 100).toFixed(2)}</span><a class="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" href={`#/checkout/${listing.id}`}>{isSignedIn ? 'Buy' : 'Sign in to buy'}</a></div></div>
      </article>
    {/each}
  </div>
</section>
