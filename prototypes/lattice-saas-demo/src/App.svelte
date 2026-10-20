<script lang="ts">
import { createRouter, getRuntime, Router, usePrincipal } from '@protoyard/renderer-svelte';
import { applySaasScenarioSession, createBilling } from '@protoyard/saas';
import { InboxDrawer, provideSaas, TrialBanner, WorkspaceSwitcher } from '@protoyard/saas-ui';
import { onDestroy, onMount } from 'svelte';
import SignOutButton from './components/SignOutButton.svelte';
import { LATTICE_PLANS } from './domain/plans.ts';
import { LATTICE_PATHS, LATTICE_SAAS_UI, latticeRoutes } from './saas.ts';
import Dashboard from './screens/Dashboard.svelte';
import Projects from './screens/Projects.svelte';

const runtime = getRuntime();
const principal = usePrincipal(runtime);
// The plan catalog is the single price source (seeded subscriptions read it too).
const billing = createBilling(runtime, LATTICE_PLANS);
provideSaas(runtime, { billing, ...LATTICE_SAAS_UI });

const router = createRouter(
  latticeRoutes(runtime.session, { dashboard: Dashboard, projects: Projects }),
  {
    titleSuffix: runtime.manifest.name,
    revalidateOn: (refresh) => runtime.session.subscribe(refresh),
  }
);
const unsubscribeScenario = runtime.scenarios.subscribe(
  () => void applySaasScenarioSession(runtime)
);
onMount(() => void applySaasScenarioSession(runtime));
onDestroy(() => {
  router.destroy();
  unsubscribeScenario();
});

const signedIn = $derived(principal.current !== null);
</script>

<div class="min-h-dvh bg-background text-foreground">
  {#if signedIn}<TrialBanner />{/if}
  <header class="sticky top-0 z-30 border-b border-border/80 bg-background/95 backdrop-blur">
    <nav class="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center gap-3 px-4 py-2 sm:px-6" aria-label="Main navigation">
      <a class="mr-auto inline-flex items-center gap-2 font-semibold tracking-tight" href="#/">
        <span class="grid size-8 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground" aria-hidden="true">L</span>
        <span class="text-lg">lattice</span><span class="sr-only"> home</span>
      </a>
      {#if signedIn}
        <WorkspaceSwitcher {runtime} />
        <div class="flex items-center gap-1 overflow-x-auto text-sm">
          <a class="rounded-md px-3 py-2 hover:bg-muted" href="#/app">Overview</a>
          <a class="rounded-md px-3 py-2 hover:bg-muted" href="#/projects">Projects</a>
          <a class="rounded-md px-3 py-2 hover:bg-muted" href="#/settings/members">Team</a>
          <a class="rounded-md px-3 py-2 hover:bg-muted" href="#/inbox">Inbox</a>
          <a class="rounded-md px-3 py-2 hover:bg-muted" href="#/billing/plans">Plans</a>
          <a class="rounded-md px-3 py-2 hover:bg-muted" href="#/settings">Settings</a>
        </div>
        <InboxDrawer />
        <SignOutButton {runtime} signInPath={LATTICE_PATHS.signInPath} />
      {:else}
        <span class="hidden rounded-full border border-border px-3 py-1 text-xs text-muted-foreground sm:inline-flex">Interactive product simulation</span>
        <a class="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted" href="#/sign-in">Sign in</a>
        <a class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90" href="#/sign-up">Start your workspace</a>
      {/if}
    </nav>
  </header>
  <main id="main" class="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
    <Router {router} />
  </main>
  <footer class="border-t border-border/70 px-4 py-5 text-center text-xs text-muted-foreground">
    Lattice is a fictional product. Authentication, invitations, plans, and billing are simulated locally.
  </footer>
</div>
