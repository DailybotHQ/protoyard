<script lang="ts">
import type { BillingAttempt, BillingPlan, BillingService, CheckoutOutcome } from '@protoyard/saas';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@protoyard/ui';
import { onMount } from 'svelte';
import { RadioGroup } from 'texuli/choice';
import { getSaas } from '../../context.ts';
import { formatCents } from '../../lib/money.ts';

interface Props {
  billing?: BillingService;
  /**
   * Show the simulator outcome picker (success / declined / requires-action).
   * Intended for DevTools and scenario demos — keep false in published reviewer builds.
   */
  showOutcomePicker?: boolean;
  /** Initial plan id when not taken from the hash query. */
  planId?: string;
}

let { billing: billingProp, showOutcomePicker = false, planId: planIdProp }: Props = $props();

const saas = getSaas();
const billing = $derived(billingProp ?? saas.billing);

const OUTCOMES: { id: CheckoutOutcome; label: string }[] = [
  { id: 'success', label: 'Success (simulated charge)' },
  { id: 'declined', label: 'Declined' },
  { id: 'requires-action', label: 'Requires action' },
];

let planId = $state('');
let plan = $state<BillingPlan | null>(null);
let outcome = $state<CheckoutOutcome>('success');
let busy = $state(false);
let error = $state<string | null>(null);
let result = $state<BillingAttempt | null>(null);

function readPlanFromHash(): string | undefined {
  const hash = location.hash.replace(/^#/, '');
  const q = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  return new URLSearchParams(q).get('plan') ?? undefined;
}

onMount(() => {
  if (!billing) {
    error = 'Billing is not configured for this prototype.';
    return;
  }
  const id = planIdProp ?? readPlanFromHash() ?? billing.plans()[0]?.id ?? '';
  planId = id;
  plan = billing.plans().find((p) => p.id === id) ?? null;
  if (!plan && id) error = `Unknown plan "${id}".`;
});

async function submit() {
  if (!billing || !plan) return;
  busy = true;
  error = null;
  result = null;
  try {
    const current = await billing.subscription();
    const input = { planId: plan.id, outcome };
    result =
      current && current.status !== 'trialing' && current.planId !== plan.id
        ? await billing.upgrade(input)
        : await billing.checkout(input);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    busy = false;
  }
}
</script>

<div class="mx-auto max-w-lg space-y-4 p-6" data-testid="billing-checkout">
  <Card>
    <CardHeader>
      <CardTitle>Checkout</CardTitle>
      <CardDescription>
        Simulated payment — no card, no charge. Nothing here contacts a payment provider.
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      {#if plan}
        <div class="rounded-md border bg-muted/40 p-3 text-sm" data-testid="checkout-plan">
          <p class="font-medium">{plan.name}</p>
          <p class="text-muted-foreground">
            {formatCents(plan.unitAmountCents, plan.currency)} / {plan.interval} / seat
          </p>
        </div>
      {:else}
        <p class="text-sm text-muted-foreground">Select a plan from the pricing page.</p>
      {/if}

      <p
        class="rounded-md border border-dashed border-amber-500/50 bg-amber-500/5 px-3 py-2 text-sm"
        data-testid="checkout-disclaimer"
        role="note"
      >
        Simulated payment — no card, no charge.
      </p>

      {#if showOutcomePicker}
        <div class="space-y-2" data-testid="checkout-outcome-picker">
          <h3 class="text-sm font-medium">Simulator outcome (DevTools / scenario)</h3>
          <RadioGroup
            name="checkout-outcome"
            aria-label="Simulator outcome"
            bind:value={outcome}
            items={OUTCOMES.map((item) => ({ value: item.id, label: item.label }))}
            class="gap-2"
          />
        </div>
      {/if}

      {#if error}
        <p class="text-sm text-destructive" role="alert">{error}</p>
      {/if}

      {#if result}
        <div
          class="rounded-md border p-3 text-sm"
          data-testid="checkout-result"
          data-outcome={result.outcome}
          role="status"
        >
          <p class="font-medium capitalize">Outcome: {result.outcome}</p>
          <p>
            Invoice {result.invoice.id}
            · {formatCents(result.invoice.amountCents, result.invoice.currency)}
            · {result.invoice.status}
          </p>
          {#if result.subscription}
            <p>Subscription plan: {result.subscription.planId} ({result.subscription.status})</p>
          {/if}
        </div>
      {/if}
    </CardContent>
    <CardFooter class="flex flex-wrap gap-2">
      <Button disabled={!plan || busy} loading={busy} onclick={() => submit()}>
        Confirm simulated payment
      </Button>
      <Button href="#/billing/plans" variant="ghost">Back to plans</Button>
      <Button href="#/billing/portal" variant="outline">Billing portal</Button>
    </CardFooter>
  </Card>
</div>
