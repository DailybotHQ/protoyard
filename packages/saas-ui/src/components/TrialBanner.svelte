<script lang="ts">
import type { BillingService } from '@protoyard/saas';
import { Button } from '@protoyard/ui';
import { onMount } from 'svelte';
import { getSaas } from '../context.ts';
import { daysUntil } from '../lib/money.ts';

interface Props {
  /** Billing service; when omitted the kit context must provide one. */
  billing?: BillingService;
  /** Where "Upgrade" navigates (hash path). */
  upgradeHref?: string;
  /** Force-refresh subscription (tests). */
  refreshKey?: number;
}

let { billing: billingProp, upgradeHref = '#/billing/plans', refreshKey = 0 }: Props = $props();

const saas = getSaas();
const billing = $derived(billingProp ?? saas.billing);

let trialEndsAt = $state<string | null>(null);
let planName = $state<string | null>(null);
let status = $state<string | null>(null);
let error = $state<string | null>(null);
let loading = $state(true);

const daysLeft = $derived.by(() => {
  if (!trialEndsAt) return null;
  return daysUntil(trialEndsAt, saas.runtime.clock.nowMs());
});

const visible = $derived(status === 'trialing' && daysLeft !== null);

async function load() {
  if (!billing) {
    loading = false;
    error = 'Billing is not configured for this prototype.';
    return;
  }
  loading = true;
  error = null;
  try {
    const sub = await billing.subscription();
    status = sub?.status ?? null;
    trialEndsAt = sub?.trialEndsAt ?? null;
    if (sub) {
      const plan = billing.plans().find((p) => p.id === sub.planId);
      planName = plan?.name ?? sub.planId;
    } else {
      planName = null;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    status = null;
    trialEndsAt = null;
  } finally {
    loading = false;
  }
}

onMount(() => {
  void load();
});

$effect(() => {
  void refreshKey;
  void load();
});
</script>

{#if loading}
  <div class="sr-only" role="status">Loading trial status</div>
{:else if error}
  <div class="sr-only" role="status">{error}</div>
{:else if visible}
  <div
    class="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-950 dark:text-amber-50"
    data-testid="trial-banner"
    role="status"
  >
    <p class="min-w-0 flex-1">
      {#if daysLeft === 0}
        Your <strong>{planName ?? 'plan'}</strong> trial ends today (simulated clock).
      {:else if daysLeft === 1}
        <strong>1 day</strong> left on your <strong>{planName ?? 'plan'}</strong> trial.
      {:else}
        <strong>{daysLeft} days</strong> left on your <strong>{planName ?? 'plan'}</strong> trial.
      {/if}
      <span class="text-muted-foreground"> Simulation only — no real charge. </span>
    </p>
    <Button href={upgradeHref} size="sm" variant="outline">View plans</Button>
  </div>
{/if}
