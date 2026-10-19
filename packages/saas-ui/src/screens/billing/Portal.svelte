<script lang="ts">
import type { BillingService, SaasInvoice, SaasSubscription } from '@protoyard/saas';
import {
  AlertDialog,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@protoyard/ui';
import { onMount } from 'svelte';
import { getSaas } from '../../context.ts';
import { formatCents } from '../../lib/money.ts';

interface Props {
  billing?: BillingService;
}

let { billing: billingProp }: Props = $props();
const saas = getSaas();
const billing = $derived(billingProp ?? saas.billing);

let subscription = $state<SaasSubscription | null>(null);
let invoices = $state<SaasInvoice[]>([]);
let planName = $state<string | null>(null);
let error = $state<string | null>(null);
let busy = $state(false);
let notice = $state<string | null>(null);
// Cancelling is destructive: the button opens a confirmation first.
let cancelOpen = $state(false);

async function refresh() {
  if (!billing) {
    error = 'Billing is not configured for this prototype.';
    return;
  }
  error = null;
  try {
    const [sub, inv] = await Promise.all([billing.subscription(), billing.invoices()]);
    subscription = sub ?? null;
    invoices = inv;
    planName = sub ? (billing.plans().find((p) => p.id === sub.planId)?.name ?? sub.planId) : null;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
}

onMount(() => {
  void refresh();
});

async function cancel() {
  if (!billing) return;
  busy = true;
  notice = null;
  try {
    subscription = await billing.cancel();
    notice = 'Cancellation scheduled at period end (simulated).';
    await refresh();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    busy = false;
  }
}

async function resume() {
  if (!billing) return;
  busy = true;
  notice = null;
  try {
    subscription = await billing.resume();
    notice = 'Subscription resumed (simulated).';
    await refresh();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    busy = false;
  }
}

function statusBadge(status: string): string {
  return status.replace(/_/g, ' ');
}
</script>

<div class="mx-auto max-w-3xl space-y-6 p-6" data-testid="billing-portal">
  <header class="space-y-1">
    <h1 class="text-2xl font-semibold tracking-tight">Billing portal</h1>
    <p class="text-sm text-muted-foreground">
      Simulated subscription, seats and invoices. No payment provider is contacted.
    </p>
  </header>

  {#if error}
    <p class="text-sm text-destructive" role="alert">{error}</p>
  {/if}
  {#if notice}
    <p class="text-sm text-emerald-700 dark:text-emerald-300" data-testid="portal-notice" role="status">
      {notice}
    </p>
  {/if}

  <Card data-testid="portal-subscription">
    <CardHeader>
      <CardTitle>Current plan</CardTitle>
      <CardDescription>Organization subscription from the simulated billing engine.</CardDescription>
    </CardHeader>
    <CardContent class="space-y-3 text-sm">
      {#if !subscription}
        <p class="text-muted-foreground">No active subscription.</p>
        <Button href="#/billing/plans">Browse plans</Button>
      {:else}
        <dl class="grid gap-2 sm:grid-cols-2">
          <div>
            <dt class="text-muted-foreground">Plan</dt>
            <dd class="font-medium">{planName}</dd>
          </div>
          <div>
            <dt class="text-muted-foreground">Status</dt>
            <dd>
              <Badge variant="secondary">{statusBadge(subscription.status)}</Badge>
              {#if subscription.cancelAtPeriodEnd}
                <Badge class="ml-1" variant="outline">Cancels at period end</Badge>
              {/if}
            </dd>
          </div>
          <div>
            <dt class="text-muted-foreground">Seats</dt>
            <dd data-testid="portal-seats">{subscription.seats}</dd>
          </div>
          <div>
            <dt class="text-muted-foreground">Price / seat</dt>
            <dd>
              {formatCents(subscription.unitAmountCents, subscription.currency)} / {subscription.interval}
            </dd>
          </div>
          <div>
            <dt class="text-muted-foreground">Current period</dt>
            <dd>
              {subscription.currentPeriodStart.slice(0, 10)} → {subscription.currentPeriodEnd.slice(0, 10)}
            </dd>
          </div>
          {#if subscription.trialEndsAt}
            <div>
              <dt class="text-muted-foreground">Trial ends</dt>
              <dd>{subscription.trialEndsAt.slice(0, 10)}</dd>
            </div>
          {/if}
        </dl>
        <div class="flex flex-wrap gap-2 pt-2">
          {#if subscription.cancelAtPeriodEnd}
            <Button disabled={busy} loading={busy} onclick={() => void resume()} variant="default">
              Resume subscription
            </Button>
          {:else if subscription.status === 'active' || subscription.status === 'trialing'}
            <Button disabled={busy} loading={busy} onclick={() => (cancelOpen = true)} variant="destructive">
              Cancel at period end
            </Button>
          {/if}
          <Button href="#/billing/plans" variant="outline">Change plan</Button>
        </div>
      {/if}
    </CardContent>
  </Card>

  <Card data-testid="portal-invoices">
    <CardHeader>
      <CardTitle>Invoices</CardTitle>
      <CardDescription>Amounts are integer cents formatted for display.</CardDescription>
    </CardHeader>
    <CardContent>
      {#if invoices.length === 0}
        <p class="text-sm text-muted-foreground">No invoices yet.</p>
      {:else}
        <ul class="divide-y text-sm">
          {#each invoices as invoice (invoice.id)}
            <li class="flex flex-wrap items-center justify-between gap-2 py-3" data-testid={`invoice-${invoice.id}`}>
              <div>
                <p class="font-medium">{invoice.id}</p>
                <p class="text-muted-foreground">
                  {invoice.issuedAt.slice(0, 10)} · {invoice.status}
                </p>
              </div>
              <p class="font-mono">
                {formatCents(invoice.amountCents, invoice.currency)}
              </p>
            </li>
          {/each}
        </ul>
      {/if}
    </CardContent>
  </Card>
</div>

<AlertDialog
  bind:open={cancelOpen}
  title={`Cancel the ${planName ?? 'current'} plan at period end?`}
  description={subscription
    ? `The subscription stays active until ${subscription.currentPeriodEnd.slice(0, 10)}, then ends. You can resume it before then. Simulated: no payment provider is contacted.`
    : 'The subscription ends at the close of the current period.'}
  confirmLabel="Schedule cancellation"
  cancelLabel="Keep subscription"
  destructive
  onConfirm={cancel}
/>
