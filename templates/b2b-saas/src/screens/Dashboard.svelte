<script lang="ts">
import { getRuntime, usePrincipal } from '@protoyard/renderer-svelte';
import { SsoButtons } from '@protoyard/saas-ui';

const runtime = getRuntime();
const principal = usePrincipal(runtime);
const signedIn = $derived(principal.current !== null);
</script>

{#if signedIn}
  <section class="space-y-6">
    <div>
      <p class="text-sm font-medium text-primary">Northstar Studio</p>
      <h1 class="mt-2 text-3xl font-semibold tracking-tight">Your workspace is ready</h1>
      <p class="mt-2 max-w-2xl text-muted-foreground">Manage projects, invite teammates, and explore the simulated SaaS flows.</p>
    </div>
    <div class="grid gap-4 sm:grid-cols-3">
      <a class="rounded-xl border border-border bg-surface p-5" href="#/projects"><h2 class="font-semibold">Projects</h2><p class="mt-2 text-sm text-muted-foreground">Track work from planning to completion.</p></a>
      <a class="rounded-xl border border-border bg-surface p-5" href="#/billing/plans"><h2 class="font-semibold">Billing</h2><p class="mt-2 text-sm text-muted-foreground">Try simulated plans and checkout.</p></a>
      <a class="rounded-xl border border-border bg-surface p-5" href="#/settings"><h2 class="font-semibold">Settings</h2><p class="mt-2 text-sm text-muted-foreground">Update your profile and preferences.</p></a>
    </div>
  </section>
{:else}
  <section class="mx-auto grid max-w-4xl gap-8 py-12 md:grid-cols-[1.2fr_0.8fr] md:items-center">
    <div>
      <p class="text-sm font-semibold uppercase tracking-wide text-primary">B2B SaaS starter</p>
      <h1 class="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">A workspace that feels ready to grow.</h1>
      <p class="mt-4 text-lg text-muted-foreground">Explore sign-in, workspaces, onboarding, billing, inbox, and project management. Everything runs locally in this browser.</p>
      <div class="mt-6 flex flex-wrap gap-3">
        <a class="rounded-md bg-primary px-4 py-2 text-primary-foreground" href="#/sign-up">Create a workspace</a>
        <a class="rounded-md border border-border px-4 py-2" href="#/sign-in">Sign in</a>
      </div>
    </div>
    <div class="rounded-xl border border-border bg-surface p-6 shadow-soft">
      <h2 class="text-lg font-semibold">Continue with a provider</h2>
      <p class="mb-4 mt-1 text-sm text-muted-foreground">Simulated SSO. No provider account is contacted.</p>
      <SsoButtons providers={['google']} scenarios={{ google: { identity: { subject: 'google-user_0001', name: 'Demo Owner', email: 'owner@example.com', emailShared: true }, outcome: 'success' } }} />
    </div>
  </section>
{/if}
