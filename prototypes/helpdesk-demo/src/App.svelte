<script lang="ts">
import { ErrorState, LoadingState } from '@protoyard/ui';
import AppSearch from './components/AppSearch.svelte';
import NotificationsBell from './components/NotificationsBell.svelte';
import { provideCrudApp } from './lib/context.ts';
import Home from './screens/Home.svelte';

/**
 * The shared blueprint app shell (@protoyard/crud/app), customized for the help
 * desk (owned file: regeneration leaves it alone): the SLA dashboard as home, the
 * ticket workspace route, tickets opening in their workspace from lists and
 * search, and the help desk's own search in the header.
 */
const { blueprint, services } = provideCrudApp();

let attempt = $state(0);
const shell = $derived.by(() => {
  void attempt;
  return import('@protoyard/crud/app');
});

const extraRoutes = [
  {
    path: '/tickets/:id/workspace',
    title: 'Ticket',
    load: () => import('./screens/TicketWorkspace.svelte'),
  },
];

/** Tickets open in the agent workspace; other records open their edit form. */
const recordHref = (entityName: string, id: string) =>
  entityName === 'ticket' ? `/tickets/${encodeURIComponent(id)}/workspace` : undefined;
</script>

{#await shell}
  <LoadingState label="Loading the help desk" class="py-16" />
{:then { BlueprintApp }}
  <BlueprintApp {blueprint} {services} home={Home} {extraRoutes} {recordHref}>
    {#snippet actions()}
      <div class="flex items-center gap-2">
        <AppSearch />
        <NotificationsBell />
      </div>
    {/snippet}
  </BlueprintApp>
{:catch error}
  <ErrorState
    title="The help desk could not be loaded"
    message={error instanceof Error ? error.message : String(error)}
    onRetry={() => {
      attempt += 1;
    }}
    retryLabel="Try again"
  />
{/await}
