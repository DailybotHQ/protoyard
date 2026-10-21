<script lang="ts">
import type { AppModel, Blueprint } from '@protoyard/blueprint';
import { getRuntime } from '@protoyard/renderer-svelte';
import { createBilling } from '@protoyard/saas';
import { provideSaas, saasRoutes } from '@protoyard/saas-ui';
import { type Component, untrack } from 'svelte';
import { createBusinessAdapter } from './adapter.ts';
import { PLAYER_BILLING_PLANS } from './definition.ts';
import { withArchetypeNav } from './nav.ts';

/**
 * The blueprint's app with the SaaS kit: sign-up and sign-in, the onboarding
 * wizard at the archetype's route, invitations, an inbox and simulated
 * billing, all lazy kit routes. Settings and members stay the blueprint's.
 */
let {
  blueprint,
  model,
  themeLibrary,
  BlueprintApp,
}: {
  blueprint: Blueprint;
  model: AppModel;
  themeLibrary?: () => Promise<{ id: string; name: string }[]>;
  // biome-ignore lint/suspicious/noExplicitAny: the crud app component is passed through.
  BlueprintApp: Component<any>;
} = $props();

const runtime = getRuntime();
// The kit context and routes are fixed for the app's lifetime (BlueprintApp reads them once).
const adapter = untrack(() => createBusinessAdapter(blueprint));
provideSaas(runtime, {
  lazy: true,
  onboardingPath: adapter.path,
  billing: createBilling(runtime, PLAYER_BILLING_PLANS),
});
const extraRoutes = saasRoutes({
  session: runtime.session,
  lazy: true,
  onboardingPath: adapter.path,
  include: ['auth', 'onboarding', 'billing', 'invites', 'inbox'],
});
const appModel = $derived(withArchetypeNav(model, adapter));
</script>

<BlueprintApp {blueprint} model={appModel} {themeLibrary} {extraRoutes} />
