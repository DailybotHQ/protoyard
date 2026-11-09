<script lang="ts">
import { getRuntime, usePrincipal } from '@protoyard/renderer-svelte';
import { SsoButtons } from '@protoyard/saas-ui';
import { Button, Card, CardDescription, CardTitle } from '@protoyard/ui';
import { Heading, Text } from 'texuli/typography';

const runtime = getRuntime();
const principal = usePrincipal(runtime);
const signedIn = $derived(principal.current !== null);
</script>

{#if signedIn}
  <section class="space-y-6">
    <div>
      <Text size="sm" weight="medium" tone="primary">Northstar Studio</Text>
      <Heading level={1} size="xl" class="mt-2">Your workspace is ready</Heading>
      <Text tone="muted" class="mt-2 max-w-2xl">Manage projects, invite teammates, and explore the simulated SaaS flows.</Text>
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
      <Text size="sm" weight="semibold" tone="primary" transform="uppercase" tracking="wide">B2B SaaS starter</Text>
      <Heading level={1} size="display" class="mt-3">A workspace that feels ready to grow.</Heading>
      <Text size="lg" tone="muted" class="mt-4">Explore sign-in, workspaces, onboarding, billing, inbox, and project management. Everything runs locally in this browser.</Text>
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
