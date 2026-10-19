<script lang="ts">
import { navigate, runService } from '@protoyard/renderer-svelte';
import { createMagicLinkServices } from '@protoyard/saas';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  FormField,
  Input,
} from '@protoyard/ui';
import { onMount } from 'svelte';
import { applyServiceError, authServices, hashParam, routeHref } from './helpers.ts';

const { runtime, config } = authServices();
const magic = createMagicLinkServices(runtime);
let email = $state('');
let tokenId = $state('');
let busy = $state(false);
let complete = $state(false);
let issues = $state<Record<string, string>>({});
let message = $state('');

async function submit() {
  busy = true;
  issues = {};
  message = '';
  const result = await runService(() => magic.issue({ email }));
  busy = false;
  if (!result.ok) {
    applyServiceError(
      result.error,
      (next) => (issues = next),
      (next) => (message = next)
    );
    return;
  }
  complete = true;
}

async function consume(token: string) {
  busy = true;
  const result = await runService(() => magic.consume(token));
  busy = false;
  if (!result.ok) {
    applyServiceError(
      result.error,
      (next) => (issues = next),
      (next) => (message = next)
    );
    return;
  }
  if (result.value.status === 'mfa-required') {
    navigate(`/auth/mfa?challenge=${encodeURIComponent(result.value.challenge.id)}`);
    return;
  }
  complete = true;
  message = 'You are signed in. Opening your app…';
  navigate(config.homePath);
}

onMount(() => {
  tokenId = hashParam('token');
  if (tokenId) void consume(tokenId);
});
</script>

<main class="mx-auto grid min-h-app w-full max-w-md content-center p-4 sm:p-8" data-testid="auth-magic-link">
  <Card>
    <CardHeader>
      <CardTitle>{tokenId ? 'Signing you in' : 'Email me a sign-in link'}</CardTitle>
      <CardDescription>Magic links stay inside this simulated prototype.</CardDescription>
    </CardHeader>
    <CardContent>
      {#if busy}
        <p role="status" class="text-sm text-muted-foreground">Checking your simulated sign-in link…</p>
      {:else if complete}
        <p role="status" class="text-sm">{message || 'Check your simulated inbox for a sign-in link. Nothing was emailed.'}</p>
      {:else if tokenId}
        {#if message}<p role="alert" class="text-sm text-destructive">{message}</p>{/if}
        <Button onclick={() => consume(tokenId)}>Try this link again</Button>
      {:else}
        <form class="grid gap-4" onsubmit={(event) => { event.preventDefault(); void submit(); }}>
          <FormField label="Email" required error={issues.email} description="Use an address at example.com.">
            {#snippet children(control)}
              <Input {...control.props} type="email" autocomplete="email" bind:value={email} required />
            {/snippet}
          </FormField>
          {#if message}<p role="alert" class="text-sm text-destructive">{message}</p>{/if}
          <Button type="submit" loading={busy} loadingLabel="Sending link" disabled={busy}>Send sign-in link</Button>
        </form>
      {/if}
    </CardContent>
    <CardFooter><Button href={routeHref(config.signInPath)} variant="ghost">Back to sign in</Button></CardFooter>
  </Card>
  <p class="mt-4 text-center text-xs text-muted-foreground">Simulation only — no email is sent.</p>
</main>
