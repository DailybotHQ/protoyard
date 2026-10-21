<script lang="ts">
import type { AppRoute } from '@protoyard/blueprint';
import type { RouteParams } from '@protoyard/renderer-svelte';
import { ErrorState, LoadingState } from '@protoyard/ui';
import type { Component } from 'svelte';
import { getScreenKind } from '../registry.ts';
import { useBlueprintApp } from './context.ts';

/** A blueprint screen with its own view, loaded lazily through the screen-kind registry. */
let {
  route,
  params = {},
}: {
  route: Extract<AppRoute, { view: 'screen' }>;
  params?: RouteParams;
} = $props();

const app = useBlueprintApp();

// biome-ignore lint/suspicious/noExplicitAny: registry components take adapted props.
type AnyComponent = Component<any>;

async function load(
  target: typeof route,
  current: RouteParams
): Promise<{ View: AnyComponent; props: Record<string, unknown> }> {
  const screen = app.blueprint.screens[target.screenIndex];
  if (screen?.type !== target.screenType) {
    throw new Error(`Blueprint screen ${target.screenIndex} is not a ${target.screenType}.`);
  }
  const kind = getScreenKind(target.screenType);
  const library =
    target.screenType === 'settings' && app.themeLibrary ? await app.themeLibrary() : undefined;
  const View = await kind.load();
  const props = kind.adaptProps({
    runtime: app.runtime,
    blueprint: app.blueprint,
    services: app.services,
    screen: screen as unknown as Record<string, unknown>,
    params: current,
    ...(library ? { library } : {}),
    ...(target.screenType === 'detail' && target.entity
      ? { entityName: target.entity, recordId: current.id ?? '' }
      : {}),
  });
  return { View, props };
}

let attempt = $state(0);
// The router keeps this component for every id of the route, and a derived
// tracks only reads made before load()'s first await: depend on the params'
// values here (not the object, which the router recreates on every render).
const paramsKey = $derived(JSON.stringify(params));
const loaded = $derived.by(() => {
  void attempt;
  return load(route, JSON.parse(paramsKey) as RouteParams);
});
</script>

{#await loaded}
  <LoadingState label="Loading screen" class="py-16" />
{:then { View, props }}
  <View {...props} />
{:catch error}
  <ErrorState
    title="This screen could not be shown"
    message={error instanceof Error ? error.message : String(error)}
    onRetry={() => {
      attempt += 1;
    }}
    retryLabel="Try again"
  />
{/await}
