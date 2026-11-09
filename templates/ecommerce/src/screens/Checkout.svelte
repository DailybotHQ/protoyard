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
  Notice,
  RadioGroup,
  RadioGroupItem,
  Select,
  Skeleton,
} from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Heading, Prose, Text } from 'texuli/typography';
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
  <Skeleton class="h-96 w-full" />
{:else if (lines.current?.length ?? 0) === 0}
  <EmptyState icon={ShoppingCart} title="Nothing to check out" description="Your cart is empty.">
    {#snippet action()}<Button href="#/">Start shopping</Button>{/snippet}
  </EmptyState>
{:else}
  <Notice
    tone="warning"
    icon={ShieldAlert}
    class="mb-6"
    aria-label="Demo checkout notice"
    title="Demo checkout — no real payment."
    text="Never enter real card data anywhere in this prototype. There are no card fields: the demo wallet “pays” instantly and nothing leaves your browser."
  />

  {#if offline}
    <Notice
      tone="error"
      icon={WifiOff}
      class="mb-6"
      title="You are offline (simulated)."
      text="Placing the order will fail — nothing will be charged or saved, and your cart stays as it is."
    />
  {/if}

  <form class="grid gap-6 lg:grid-cols-3" onsubmit={pay} oninput={clearError} novalidate aria-describedby={failure ? 'checkout-failure' : undefined}>
    <div class="space-y-6 lg:col-span-2">
      <Card class="p-5">
        <Heading level={2} size="sm">Shipping address</Heading>
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
          <legend><Text as="span" weight="semibold">Delivery</Text></legend>
          <RadioGroup bind:value={form.shippingMethod} name="shipping" aria-label="Delivery" orientation="horizontal" class="mt-4 grid gap-3 sm:grid-cols-2">
            {#each SHIPPING_METHODS as method (method)}
              {@const rate = SHIPPING_RATES[method]}
              {@const price = computeTotals((lines.current ?? []).map((l) => ({ unitPriceCents: l.product.priceCents, quantity: l.quantity })), method).shippingCents}
              <RadioGroupItem
                value={method}
                label={rate.label}
                description={`${price ? money(price) : 'Free'} · ${rate.eta}`}
                card
              />
            {/each}
          </RadioGroup>
        </fieldset>
      </Card>
    </div>

    <Card class="h-fit p-5 lg:sticky lg:top-24">
      <Heading level={2} size="sm">Order summary</Heading>
      <ul class="mt-4 space-y-2">
        {#each lines.current ?? [] as line (line.id)}
          <li class="flex justify-between gap-3">
            <Text as="span" size="sm" truncate class="min-w-0">{line.quantity} × {line.product.name}</Text>
            <Text as="span" size="sm" tabular>{money(line.product.priceCents * line.quantity)}</Text>
          </li>
        {/each}
      </ul>
      <Box border="block-start" radius="none" padding="none" class="mt-4 pt-4">
      <dl class="space-y-2">
        <div class="flex justify-between"><dt><Text as="span" size="sm" tone="muted">Subtotal</Text></dt><dd><Text as="span" size="sm" tabular>{money(totals.subtotalCents)}</Text></dd></div>
        <div class="flex justify-between"><dt><Text as="span" size="sm" tone="muted">Shipping</Text></dt><dd><Text as="span" size="sm" tabular>{totals.shippingCents ? money(totals.shippingCents) : 'Free'}</Text></dd></div>
        <div class="flex justify-between"><dt><Text as="span" size="sm" tone="muted">Tax (8.25%)</Text></dt><dd><Text as="span" size="sm" tabular>{money(totals.taxCents)}</Text></dd></div>
        <Box border="block-start" radius="none" padding="none" class="flex justify-between pt-2"><dt><Text as="span" weight="semibold">Total</Text></dt><dd><Text as="span" weight="semibold" tabular>{money(totals.totalCents)}</Text></dd></Box>
      </dl>
      </Box>

      {#if shortages.length > 0}
        <Notice tone="error" class="mt-4" title="Not enough stock — no order was placed.">
          <Prose class="mt-1">
            <ul>
              {#each shortages as s (s.productId)}
                <li><Text as="span" size="sm">{s.name}: you asked for {s.requested}, {s.available === 0 ? 'none are' : `only ${s.available} ${s.available === 1 ? 'is' : 'are'}`} left.</Text></li>
              {/each}
            </ul>
          </Prose>
          <Button variant="link" size="sm" class="mt-1" onclick={() => navigate('/cart')}>Adjust your cart</Button>
        </Notice>
      {/if}
      {#if errors.cart}<Text size="sm" tone="destructive" role="alert" class="mt-4">{errors.cart}</Text>{/if}
      {#if failure}
        <Notice
          id="checkout-failure"
          tone="error"
          class="mt-4"
          title="Checkout failed — nothing was charged or saved."
          text={`${failure} Your cart is unchanged; try again when you are back online.`}
        />
      {/if}

      <Button type="submit" size="lg" class="mt-5 w-full" loading={paying} loadingLabel="Placing order">
        <LucideIcon icon={Wallet} class="size-4" />Pay with demo wallet · {money(totals.totalCents)}
      </Button>
      <Text size="xs" tone="muted" class="mt-3 flex items-center justify-center gap-1.5">
        <LucideIcon icon={Lock} class="size-3" />Simulated payment — no card, no charge.
      </Text>
    </Card>
  </form>
{/if}
