<script lang="ts">
import { runService } from '@protoyard/renderer-svelte';
import { createAuthServices } from '@protoyard/saas';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@protoyard/ui';
import { onMount } from 'svelte';
import { applyServiceError, authServices, hashParam, routeHref } from './helpers.ts';

const { runtime, config } = authServices();
const auth = createAuthServices(runtime);
let tokenId = $state('');
let busy = $state(false);
let complete = $state(false);
let issues = $state<Record<string, string>>({});
let message = $state('');

async function verify() {
  busy = true;
  issues = {};
  message = '';
  const result = await runService(() => auth.verifyEmail(tokenId));
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

onMount(() => {
  tokenId = hashParam('token');
  if (!tokenId) message = 'Open the confirmation action from your simulated inbox.';
});
</script>

<main class="mx-auto grid min-h-app w-full max-w-md content-center p-4 sm:p-8" data-testid="auth-verify-email">
  <Card>
    <CardHeader>
      <CardTitle>{complete ? 'Email confirmed' : 'Confirm your email'}</CardTitle>
      <CardDescription>Confirm the address for your simulated prototype account.</CardDescription>
    </CardHeader>
    <CardContent class="grid gap-4">
      {#if message}<p role={complete ? 'status' : 'alert'} class="text-sm {complete ? '' : 'text-destructive'}">{message}</p>{/if}
      {#if issues.form}<p role="alert" class="text-sm text-destructive">{issues.form}</p>{/if}
      {#if complete}
        <p role="status" data-testid="auth-handoff">Your account is ready. You can sign in now.</p>
      {:else}
        <p class="text-sm text-muted-foreground">This confirmation link is simulated and expires on the prototype clock.</p>
        <Button onclick={() => void verify()} loading={busy} loadingLabel="Confirming email" disabled={busy || !tokenId}>Confirm email</Button>
      {/if}
    </CardContent>
    <CardFooter><Button href={routeHref(config.signInPath)} variant="ghost">Go to sign in</Button></CardFooter>
  </Card>
</main>
