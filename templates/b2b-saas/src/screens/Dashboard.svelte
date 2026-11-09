<script lang="ts">
import { getRuntime, usePrincipal } from '@protoyard/renderer-svelte';
import { SsoButtons } from '@protoyard/saas-ui';
import { Button, Card, CardDescription, CardTitle } from '@protoyard/ui';

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
      <Card href="#/projects" class="p-5"><CardTitle level={2}>Projects</CardTitle><CardDescription class="mt-2">Track work from planning to completion.</CardDescription></Card>
      <Card href="#/billing/plans" class="p-5"><CardTitle level={2}>Billing</CardTitle><CardDescription class="mt-2">Try simulated plans and checkout.</CardDescription></Card>
      <Card href="#/settings" class="p-5"><CardTitle level={2}>Settings</CardTitle><CardDescription class="mt-2">Update your profile and preferences.</CardDescription></Card>
    </div>
  </section>
{:else}
  <section class="mx-auto grid max-w-4xl gap-8 py-12 md:grid-cols-5 md:items-center">
    <div class="md:col-span-3">
      <p class="text-sm font-semibold uppercase tracking-wide text-primary">B2B SaaS starter</p>
      <h1 class="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">A workspace that feels ready to grow.</h1>
      <p class="mt-4 text-lg text-muted-foreground">Explore sign-in, workspaces, onboarding, billing, inbox, and project management. Everything runs locally in this browser.</p>
      <div class="mt-6 flex flex-wrap gap-3">
        <Button href="#/sign-up">Create a workspace</Button>
        <Button href="#/sign-in" variant="outline">Sign in</Button>
      </div>
    </div>
    <Card class="p-6 md:col-span-2">
      <CardTitle level={2}>Continue with a provider</CardTitle>
      <CardDescription class="mb-4 mt-1">Simulated SSO. No provider account is contacted.</CardDescription>
      <SsoButtons providers={['google']} scenarios={{ google: { identity: { subject: 'google-user_0001', name: 'Demo Owner', email: 'owner@example.com', emailShared: true }, outcome: 'success' } }} />
    </Card>
  </section>
{/if}
