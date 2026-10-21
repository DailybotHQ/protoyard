<script lang="ts">
import type { RouteProps } from '@protoyard/renderer-svelte';
import MembersScreen from '../MembersScreen.svelte';
import { useBlueprintApp } from './context.ts';
import EntityPage from './EntityPage.svelte';
import HomeScreen from './HomeScreen.svelte';
import ScreenRoute from './ScreenRoute.svelte';

/** The one router component: renders what the matched app-model route says. */
let { params = {} }: RouteProps = $props();

const app = useBlueprintApp();
const route = $derived(app.routeFor(app.router.current.route?.path));
</script>

{#if !route}
  <p class="text-sm text-muted-foreground">This screen is not part of the blueprint.</p>
{:else if route.view === 'home'}
  {#if app.home}
    {@const Home = app.home}
    <Home {params} />
  {:else}
    <HomeScreen />
  {/if}
{:else if route.view === 'members'}
  <div class="space-y-4">
    <div>
      <h1 class="text-xl font-semibold">Members</h1>
      <p class="text-sm text-muted-foreground">
        Workspace people and their simulated roles. Roles are simulated policy, not security.
      </p>
    </div>
    <MembersScreen runtime={app.runtime} />
  </div>
{:else if route.view === 'entity'}
  <EntityPage entityName={route.entity} {params} />
{:else}
  <ScreenRoute {route} {params} />
{/if}
