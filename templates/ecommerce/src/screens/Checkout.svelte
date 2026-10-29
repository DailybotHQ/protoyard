<script lang="ts">
import {
  ArrowLeft,
  Lock,
  ShieldAlert,
  ShoppingCart,
  UserRound,
  Wallet,
  WifiOff,
} from '@lucide/svelte';
import {
  can,
  isValidationError,
  liveQuery,
  navigate,
  runService,
  useEnvironment,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  RadioGroup,
  RadioGroupItem,
  Select,
  Skeleton,
} from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import PageHeader from '../components/PageHeader.svelte';
import { type Order, SHIPPING_METHODS, type ShippingMethod } from '../database/schema.ts';
import { computeTotals, SHIPPING_RATES } from '../domain/catalog.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { COUNTRIES, InsufficientStockError, type Shortage } from '../domain/services.ts';
import { cartLines } from '../lib/cart.ts';
import { useShop } from '../lib/context.ts';
import { money } from '../lib/format.ts';

/**
 * Demo checkout. There are deliberately NO card fields: the "demo wallet"
 * stands in for payment, and the order is created by ONE transaction that
 * also decrements stock and empties the cart (see `checkout.placeOrder`).
 */
const { db, services } = useShop();
const principal = usePrincipal();
const environment = useEnvironment();
const me = $derived(principal.current?.persona.id ?? '');
const lines = liveQuery(() => cartLines(db, me), { initial: [], deps: () => me });

let form = $state({
  fullName: principal.current?.persona.name ?? '',
  email: principal.current?.persona.email ?? '',
  address: '',
  city: '',
  postalCode: '',
  country: 'United States',
  shippingMethod: 'standard' as ShippingMethod,
});
let errors = $state<Record<string, string>>({});
let shortages = $state<Shortage[]>([]);
let failure = $state<string | null>(null);
let paying = $state(false);

const offline = $derived(environment.current.network === 'offline');
const totals = $derived(
  computeTotals(
    (lines.current ?? []).map((l) => ({
      unitPriceCents: l.product.priceCents,
      quantity: l.quantity,
    })),
    form.shippingMethod
  )
);

async function pay(event: SubmitEvent) {
  event.preventDefault();
  paying = true;
  errors = {};
  shortages = [];
  failure = null;
  const result = await runService<Order>(() => services.checkout.placeOrder(form), {
    success: {
      title: 'Order placed',
      description: 'Paid with the demo wallet — no real money moved.',
    },
    errorTitle: 'Checkout failed',
  });
  paying = false;
  if (result.ok) {
    navigate(`/orders/${result.value.id}?placed=1`, { replace: true });
    return;
  }
  if (result.error instanceof InsufficientStockError) {
    shortages = result.error.shortages;
  } else if (isValidationError(result.error)) {
    errors = result.error.issues;
    document.getElementById(`field-${Object.keys(errors)[0]}`)?.focus();
  } else {
    failure =
      result.error instanceof Error ? result.error.message : 'The order could not be placed.';
  }
}

const field = (name: string) => `field-${name}`;

/** Clear a field's error as soon as the user edits it. */
function clearError(event: Event) {
  const id = (event.target as HTMLElement | null)?.id ?? '';
  const name = id.startsWith('field-') ? id.slice('field-'.length) : '';
  if (name && errors[name]) {
    const { [name]: _, ...rest } = errors;
    errors = rest;
  }
}
</script>

<Button variant="ghost" size="sm" class="-ml-2" onclick={() => navigate('/cart')}>
  <LucideIcon icon={ArrowLeft} class="size-4" />Back to cart
</Button>
<PageHeader title="Checkout" />

{#if !can(CAPABILITIES.checkout)}
  <EmptyState icon={UserRound} title="Sign in to check out" description="Guests can browse but not buy. Switch to the customer persona in DevTools.">
    {#snippet action()}<Button href="#/">Keep browsing</Button>{/snippet}
  </EmptyState>
{:else if lines.loading}
  <Skeleton class="h-96 w-full rounded-xl" />
{:else if (lines.current?.length ?? 0) === 0}
  <EmptyState icon={ShoppingCart} title="Nothing to check out" description="Your cart is empty.">
    {#snippet action()}<Button href="#/">Start shopping</Button>{/snippet}
  </EmptyState>
{:else}
  <div class="mb-6 flex gap-3 rounded-xl border-2 border-warning bg-warning/10 p-4" role="note" aria-label="Demo checkout notice">
    <LucideIcon icon={ShieldAlert} class="mt-0.5 size-5 shrink-0" />
    <div class="text-sm">
      <p class="font-semibold">Demo checkout — no real payment.</p>
      <p class="mt-0.5 text-muted-foreground">
        Never enter real card data anywhere in this prototype. There are no card fields: the demo wallet “pays” instantly and nothing leaves your browser.
      </p>
    </div>
  </div>

  {#if offline}
    <div class="mb-6 flex gap-3 rounded-xl border border-destructive/50 bg-destructive/5 p-4 text-sm" role="status">
      <LucideIcon icon={WifiOff} class="mt-0.5 size-5 shrink-0 text-destructive" />
      <p><span class="font-semibold">You are offline (simulated).</span> Placing the order will fail — nothing will be charged or saved, and your cart stays as it is.</p>
    </div>
  {/if}

  <form class="grid gap-6 lg:grid-cols-[1fr_22rem]" onsubmit={pay} oninput={clearError} novalidate aria-describedby={failure ? 'checkout-failure' : undefined}>
    <div class="space-y-6">
      <Card class="p-5">
        <h2 class="font-semibold">Shipping address</h2>
        <div class="mt-4 grid gap-4 sm:grid-cols-2">
          <FormField label="Full name" required error={errors.fullName} id={field('fullName')} class="sm:col-span-2">
            {#snippet children(control)}<Input {...control.props} autocomplete="name" bind:value={form.fullName} />{/snippet}
          </FormField>
          <FormField label="Email" required error={errors.email} id={field('email')} class="sm:col-span-2" description="For the (simulated) receipt.">
            {#snippet children(control)}<Input {...control.props} type="email" autocomplete="email" bind:value={form.email} />{/snippet}
          </FormField>
          <FormField label="Street address" required error={errors.address} id={field('address')} class="sm:col-span-2">
            {#snippet children(control)}<Input {...control.props} autocomplete="street-address" bind:value={form.address} placeholder="123 Example Street" />{/snippet}
          </FormField>
          <FormField label="City" required error={errors.city} id={field('city')}>
            {#snippet children(control)}<Input {...control.props} autocomplete="address-level2" bind:value={form.city} />{/snippet}
          </FormField>
          <FormField label="Postal code" required error={errors.postalCode} id={field('postalCode')}>
            {#snippet children(control)}<Input {...control.props} autocomplete="postal-code" bind:value={form.postalCode} />{/snippet}
          </FormField>
          <FormField label="Country" required error={errors.country} id={field('country')} class="sm:col-span-2">
            {#snippet children(control)}
              <Select {...control.props} items={COUNTRIES.map((c) => ({ value: c, label: c }))} bind:value={form.country} />
            {/snippet}
          </FormField>
        </div>
      </Card>

      <Card class="p-5">
        <fieldset>
          <legend class="font-semibold">Delivery</legend>
          <RadioGroup bind:value={form.shippingMethod} name="shipping" aria-label="Delivery" orientation="horizontal" class="mt-4 grid gap-3 sm:grid-cols-2">
            {#each SHIPPING_METHODS as method (method)}
              {@const rate = SHIPPING_RATES[method]}
              {@const price = computeTotals((lines.current ?? []).map((l) => ({ unitPriceCents: l.product.priceCents, quantity: l.quantity })), method).shippingCents}
              <RadioGroupItem
                value={method}
                label={rate.label}
                description={`${price ? money(price) : 'Free'} · ${rate.eta}`}
                card
                class="rounded-lg border border-border p-3 text-sm transition-colors data-[state=checked]:border-primary data-[state=checked]:bg-primary/5 hover:bg-muted"
              />
            {/each}
          </RadioGroup>
        </fieldset>
      </Card>
    </div>

    <Card class="h-fit p-5 lg:sticky lg:top-24">
      <h2 class="font-semibold">Order summary</h2>
      <ul class="mt-4 space-y-2 text-sm">
        {#each lines.current ?? [] as line (line.id)}
          <li class="flex justify-between gap-3">
            <span class="min-w-0 truncate">{line.quantity} × {line.product.name}</span>
            <span class="tabular-nums">{money(line.product.priceCents * line.quantity)}</span>
          </li>
        {/each}
      </ul>
      <dl class="mt-4 space-y-2 border-t border-border pt-4 text-sm">
        <div class="flex justify-between"><dt class="text-muted-foreground">Subtotal</dt><dd class="tabular-nums">{money(totals.subtotalCents)}</dd></div>
        <div class="flex justify-between"><dt class="text-muted-foreground">Shipping</dt><dd class="tabular-nums">{totals.shippingCents ? money(totals.shippingCents) : 'Free'}</dd></div>
        <div class="flex justify-between"><dt class="text-muted-foreground">Tax (8.25%)</dt><dd class="tabular-nums">{money(totals.taxCents)}</dd></div>
        <div class="flex justify-between border-t border-border pt-2 text-base font-semibold"><dt>Total</dt><dd class="tabular-nums">{money(totals.totalCents)}</dd></div>
      </dl>

      {#if shortages.length > 0}
        <div class="mt-4 rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm" role="alert">
          <p class="font-semibold text-destructive">Not enough stock — no order was placed.</p>
          <ul class="mt-1 list-disc space-y-0.5 pl-5">
            {#each shortages as s (s.productId)}
              <li>{s.name}: you asked for {s.requested}, {s.available === 0 ? 'none are' : `only ${s.available} ${s.available === 1 ? 'is' : 'are'}`} left.</li>
            {/each}
          </ul>
          <Button variant="link" size="sm" class="mt-1" onclick={() => navigate('/cart')}>Adjust your cart</Button>
        </div>
      {/if}
      {#if errors.cart}<p class="mt-4 text-sm text-destructive" role="alert">{errors.cart}</p>{/if}
      {#if failure}
        <div id="checkout-failure" class="mt-4 rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm" role="alert">
          <p class="font-semibold text-destructive">Checkout failed — nothing was charged or saved.</p>
          <p class="mt-0.5 text-muted-foreground">{failure} Your cart is unchanged; try again when you are back online.</p>
        </div>
      {/if}

      <Button type="submit" size="lg" class="mt-5 w-full" loading={paying} loadingLabel="Placing order">
        <LucideIcon icon={Wallet} class="size-4" />Pay with demo wallet · {money(totals.totalCents)}
      </Button>
      <p class="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <LucideIcon icon={Lock} class="size-3" />Simulated payment — no card, no charge.
      </p>
    </Card>
  </form>
{/if}
