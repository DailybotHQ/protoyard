<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import type { BillingService } from '@protoyard/saas';
import TrialBanner from '../../src/components/TrialBanner.svelte';
import { provideSaas } from '../../src/context.ts';
import Checkout from '../../src/screens/billing/Checkout.svelte';
import Plans from '../../src/screens/billing/Plans.svelte';
import Portal from '../../src/screens/billing/Portal.svelte';

interface Props {
  runtime: PrototypeRuntime;
  billing: BillingService;
  screen?: 'plans' | 'checkout' | 'portal' | 'banner';
  showOutcomePicker?: boolean;
  planId?: string;
  refreshKey?: number;
}

let {
  runtime,
  billing,
  screen = 'plans',
  showOutcomePicker = true,
  planId,
  refreshKey = 0,
}: Props = $props();

provideSaas(runtime, { billing, billingShowOutcomePicker: showOutcomePicker });
</script>

{#if screen === 'plans'}
  <Plans {billing} />
{:else if screen === 'checkout'}
  <Checkout {billing} {showOutcomePicker} {planId} />
{:else if screen === 'portal'}
  <Portal {billing} />
{:else}
  <TrialBanner {billing} {refreshKey} />
{/if}
