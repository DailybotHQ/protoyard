<script lang="ts">
import type { AppModel, Blueprint } from '@protoyard/blueprint';
import type { RouteDefinition } from '@protoyard/renderer-svelte';
import { type Component, untrack } from 'svelte';
import { createBusinessAdapter } from './adapter.ts';
import { withArchetypeNav } from './nav.ts';

/**
 * The blueprint's app with the analytics dashboard at the archetype's route.
 * The dashboard (analytics engine, date range, KPI tiles and grid) is its own
 * lazy chunk, loaded when the route opens.
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

const adapter = untrack(() => createBusinessAdapter(blueprint));
const extraRoutes: RouteDefinition[] = [
  {
    path: adapter.path,
    name: 'analytics-dashboard',
    title: 'Analytics',
    description: 'Simulated product analytics from the blueprint’s events and metrics.',
    load: () => import('./AnalyticsDashboard.svelte'),
  },
];
const appModel = $derived(withArchetypeNav(model, adapter));
</script>

<BlueprintApp {blueprint} model={appModel} {themeLibrary} {extraRoutes} />
