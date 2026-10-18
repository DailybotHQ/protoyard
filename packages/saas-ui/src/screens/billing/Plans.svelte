<script lang="ts">
import type { BillingPlan, BillingService } from '@protoyard/saas';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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

let plans = $state<readonly BillingPlan[]>([]);
let currentPlanId = $state<string | null>(null);
let error = $state<string | null>(null);

onMount(async () => {
  if (!billing) {
    error = 'Billing is not configured for this prototype.';
    return;
  }
  plans = billing.plans();
  try {
    const sub = await billing.subscription();
    currentPlanId = sub?.planId ?? null;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
});

function checkoutHref(planId: string): string {
  return `#/billing/checkout?plan=${encodeURIComponent(planId)}`;
}

function priceLabel(plan: BillingPlan): string {
  const amount = formatCents(plan.unitAmountCents, plan.currency);
  return `${amount} / ${plan.interval} / seat`;
}
</script>

<div class="mx-auto max-w-5xl space-y-6 p-6" data-testid="billing-plans">
  <header class="space-y-2">
    <h1 class="text-2xl font-semibold tracking-tight">Plans</h1>
    <p class="text-sm text-muted-foreground">
      Simulated pricing for this prototype. Choosing a plan never contacts a payment provider.
    </p>
  </header>

  {#if error}
    <p class="text-sm text-destructive" role="alert">{error}</p>
  {:else if plans.length === 0}
    <p class="text-sm text-muted-foreground">No plans are configured.</p>
  {:else}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each plans as plan (plan.id)}
        <Card data-testid={`plan-card-${plan.id}`}>
          <CardHeader>
            <div class="flex items-center justify-between gap-2">
              <CardTitle>{plan.name}</CardTitle>
              {#if currentPlanId === plan.id}
                <Badge variant="secondary">Current</Badge>
              {/if}
            </div>
            <CardDescription>{priceLabel(plan)}</CardDescription>
          </CardHeader>
          <CardContent class="space-y-2 text-sm text-muted-foreground">
            <p>{plan.trialDays}-day simulated trial when you start from free.</p>
            <p class="font-mono text-xs">plan id: {plan.id}</p>
          </CardContent>
          <CardFooter>
            <Button
              class="w-full"
              href={checkoutHref(plan.id)}
              variant={currentPlanId === plan.id ? 'outline' : 'default'}
            >
              {currentPlanId === plan.id ? 'Manage in portal' : `Choose ${plan.name}`}
            </Button>
          </CardFooter>
        </Card>
      {/each}
    </div>
  {/if}

  <p class="text-center text-sm">
    <a class="text-primary underline-offset-4 hover:underline" href="#/billing/portal"
      >Open billing portal</a
    >
  </p>
</div>
