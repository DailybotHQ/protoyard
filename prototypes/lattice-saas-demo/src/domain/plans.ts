import type { BillingPlan, SaasPlanPrice } from '@protoyard/saas';

/**
 * The Lattice plan catalog: the ONE source of truth for prices. Integer
 * cents per seat per month. `createBilling` (src/App.svelte) and the scenario
 * generator (seeded subscriptions and invoices) both read it, so a seeded Pro
 * subscription always costs what the Pro plan card says.
 */
export const LATTICE_PLANS = [
  {
    id: 'pro',
    name: 'Pro',
    unitAmountCents: 1900,
    currency: 'USD',
    interval: 'month',
    trialDays: 14,
  },
  {
    id: 'team',
    name: 'Team',
    unitAmountCents: 4900,
    currency: 'USD',
    interval: 'month',
    trialDays: 14,
  },
] as const satisfies readonly BillingPlan[];

export type LatticePlanId = (typeof LATTICE_PLANS)[number]['id'];

export function latticePlan(id: LatticePlanId): BillingPlan {
  const plan = LATTICE_PLANS.find((candidate) => candidate.id === id);
  if (!plan) throw new Error(`Unknown Lattice plan "${id}".`);
  return plan;
}

function price(id: LatticePlanId): SaasPlanPrice {
  const { unitAmountCents, interval, currency } = latticePlan(id);
  return { id, unitAmountCents, interval, currency };
}

/**
 * Prices for `generateSaasWorld`: trials and `pro` subscriptions seed the Pro
 * plan; the kit's `enterprise` subscription status maps to Team, the highest
 * Lattice plan, so every seeded subscription is a plan from the catalog.
 */
export function seededPlanPrices(): { pro: SaasPlanPrice; enterprise: SaasPlanPrice } {
  return { pro: price('pro'), enterprise: price('team') };
}
