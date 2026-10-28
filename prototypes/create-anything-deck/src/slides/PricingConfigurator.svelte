<script lang="ts">
import type { CustomSlideProps } from '@protoyard/decks-ui/app';
import { Checkbox, Input } from '@protoyard/ui';

/**
 * A live pricing configurator on a slide: pick a plan, set the seats, switch
 * to annual billing, and the total and the chart follow. Owned code of this
 * generated deck (`layout: "custom"`, registered in `src/custom-slides.ts`).
 * Its data comes from the slide's `props.data`, read defensively. Fictional
 * prices in integer cents. The first step reveals the breakdown.
 */
let { slide, step, stepCount, data }: CustomSlideProps = $props();

interface Plan {
  id: string;
  name: string;
  centsPerSeat: number;
}

const FALLBACK_PLANS: readonly Plan[] = [
  { id: 'starter', name: 'Starter', centsPerSeat: 800 },
  { id: 'team', name: 'Team', centsPerSeat: 1_500 },
  { id: 'scale', name: 'Scale', centsPerSeat: 2_400 },
];

/** Valid plans from the slide data, each id once (the lists below are keyed by id). */
function readPlans(value: unknown): readonly Plan[] {
  if (!Array.isArray(value)) return FALLBACK_PLANS;
  const seen = new Set<string>();
  const plans = value.flatMap((item) => {
    if (item === null || typeof item !== 'object') return [];
    const { id, name, centsPerSeat } = item as Record<string, unknown>;
    if (
      typeof id !== 'string' ||
      typeof name !== 'string' ||
      !Number.isInteger(centsPerSeat) ||
      (centsPerSeat as number) < 0 ||
      seen.has(id)
    ) {
      return [];
    }
    seen.add(id);
    return [{ id, name, centsPerSeat: centsPerSeat as number }];
  });
  return plans.length > 0 ? plans.slice(0, 4) : FALLBACK_PLANS;
}

function readInt(value: unknown, fallback: number, min: number, max: number): number {
  return Number.isInteger(value) ? Math.min(max, Math.max(min, value as number)) : fallback;
}

const plans = $derived(readPlans(data.plans));
const maxSeats = $derived(readInt(data.maxSeats, 200, 10, 1_000));
const annualDiscountPercent = $derived(readInt(data.annualDiscountPercent, 20, 0, 50));

let planId = $state('');
let seats = $state(25);
let annual = $state(false);
/** The seats every figure uses: the chosen count, kept within 1 … maxSeats. */
const seatCount = $derived(Math.min(maxSeats, Math.max(1, Math.trunc(seats) || 1)));

const plan = $derived(plans.find((candidate) => candidate.id === planId) ?? plans[1] ?? plans[0]);

/** Monthly total in cents for `p` at the current seats and billing. */
function monthlyCents(p: Plan): number {
  const base = p.centsPerSeat * seatCount;
  return annual ? Math.round((base * (100 - annualDiscountPercent)) / 100) : base;
}

const totalCents = $derived(plan ? monthlyCents(plan) : 0);
const savingsCents = $derived(plan && annual ? plan.centsPerSeat * seatCount - totalCents : 0);
const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const usd = (cents: number) => money.format(cents / 100);

const bars = $derived(plans.map((p) => ({ plan: p, cents: monthlyCents(p) })));
const maxBar = $derived(Math.max(1, ...bars.map((bar) => bar.cents)));
const showBreakdown = $derived(stepCount === 0 || step >= 1);
const uid = $props.id();
</script>

<div class="grid size-full grid-cols-2 gap-8 p-16 pb-20 text-foreground" data-pricing-configurator>
  <div class="flex min-h-0 flex-col gap-5">
    <h2 class="text-3xl leading-tight font-bold">{slide.title ?? 'Price your team'}</h2>

    <fieldset class="flex flex-col gap-3">
      <legend class="mb-2 text-2xl font-semibold text-muted-foreground">Plan</legend>
      <div class="grid grid-cols-3 gap-3">
        {#each plans as option (option.id)}
          <label
            class={`flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 ${option.id === plan?.id ? 'border-primary bg-primary/10' : 'border-border'}`}
          >
            <Input
              type="radio"
              name={`plan-${uid}`}
              value={option.id}
              checked={option.id === plan?.id}
              onchange={() => (planId = option.id)}
              class="size-5"
            />
            <span class="flex flex-col leading-tight">
              <span class="text-2xl font-semibold">{option.name}</span>
              <span class="text-xl text-muted-foreground">{usd(option.centsPerSeat)}/seat</span>
            </span>
          </label>
        {/each}
      </div>
    </fieldset>

    <label class="flex flex-col gap-3 text-2xl">
      <span class="font-semibold text-muted-foreground">Seats: <span class="text-foreground tabular-nums">{seatCount}</span></span>
      <Input
        type="range"
        min="1"
        max={maxSeats}
        bind:value={() => seatCount, (value) => (seats = value)}
        class="h-8 w-full"
        aria-valuetext={`${seatCount} seats`}
      />
    </label>

    <div class="flex min-h-12 items-center text-2xl">
      <Checkbox bind:checked={annual} label="Pay yearly ({annualDiscountPercent}% off)" />
    </div>

    <div class="mt-auto rounded-2xl bg-muted/60 px-6 py-4" aria-live="polite">
      <p class="text-2xl text-muted-foreground">Per month</p>
      <p class="text-3xl leading-none font-bold tabular-nums" data-pricing-total>{usd(totalCents)}</p>
      {#if showBreakdown}
        <p class="mt-2.5 text-2xl text-muted-foreground" data-pricing-breakdown>
          {seatCount} seats × {usd(plan?.centsPerSeat ?? 0)}{annual ? `, minus ${usd(savingsCents)} for paying yearly` : ''}
        </p>
      {/if}
    </div>
  </div>

  <figure class="flex min-h-0 flex-col justify-end gap-4">
    <svg
      viewBox="0 0 600 420"
      class="w-full flex-1"
      role="img"
      aria-label={`Monthly total for ${seatCount} seats: ${bars.map((bar) => `${bar.plan.name} ${usd(bar.cents)}`).join(', ')}.`}
    >
      {#each bars as bar, index (bar.plan.id)}
        {@const width = 600 / bars.length}
        {@const height = Math.max(4, (bar.cents / maxBar) * 340)}
        <rect
          x={index * width + width * 0.15}
          y={380 - height}
          width={width * 0.7}
          {height}
          rx="12"
          class={bar.plan.id === plan?.id ? 'text-primary' : 'text-muted-foreground'}
          fill="currentColor"
          fill-opacity={bar.plan.id === plan?.id ? 1 : 0.3}
          data-pricing-bar={bar.plan.id}
        />
        <text x={index * width + width / 2} y={410} text-anchor="middle" class="fill-foreground text-xl">{bar.plan.name}</text>
        <text x={index * width + width / 2} y={370 - height} text-anchor="middle" class="fill-foreground text-xl font-semibold">{usd(bar.cents)}</text>
      {/each}
    </svg>
    <figcaption class="text-xl text-muted-foreground">Monthly total by plan at {seatCount} seats. Fictional prices.</figcaption>
  </figure>
</div>
