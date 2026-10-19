<script lang="ts">
import { runService } from '@protoyard/renderer-svelte';
import { createPasswordResetServices } from '@protoyard/saas';
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
const reset = createPasswordResetServices(runtime);
let email = $state('');
let tokenId = $state('');
let password = $state('');
let confirmPassword = $state('');
let showPassword = $state(false);
let busy = $state(false);
let complete = $state(false);
let issues = $state<Record<string, string>>({});
let message = $state('');

async function request() {
  busy = true;
  issues = {};
  message = '';
  const result = await runService(() => reset.request({ email }));
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

async function consume() {
  busy = true;
  issues = {};
  message = '';
  if (password !== confirmPassword) {
    issues.confirmPassword = 'Passwords do not match.';
    busy = false;
    return;
  }
  const result = await runService(() => reset.consume({ tokenId, password }));
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
  message = 'Your simulated password was updated. You can sign in now.';
}

onMount(() => {
  tokenId = hashParam('token');
});
</script>

<main class="mx-auto grid min-h-app w-full max-w-md content-center p-4 sm:p-8" data-testid="auth-reset-password">
  <Card>
    <CardHeader>
      <CardTitle>{tokenId ? 'Choose a new password' : 'Reset your password'}</CardTitle>
      <CardDescription>Simulated account recovery for this prototype.</CardDescription>
    </CardHeader>
    <CardContent>
      {#if complete}
        <div class="grid gap-3" role="status" data-testid="auth-handoff">
          <p>{message || 'Check your simulated inbox for a password reset link. Nothing was emailed.'}</p>
          {#if tokenId}<Button href={routeHref(config.signInPath)}>Go to sign in</Button>{/if}
        </div>
      {:else if tokenId}
        <form class="grid gap-4" onsubmit={(event) => { event.preventDefault(); void consume(); }}>
          <FormField label="New password" required error={issues.password}>
            {#snippet children(control)}
              <Input {...control.props} type={showPassword ? 'text' : 'password'} autocomplete="off" bind:value={password} required />
            {/snippet}
          </FormField>
          <FormField label="Confirm password" required error={issues.confirmPassword}>
            {#snippet children(control)}
              <Input {...control.props} type={showPassword ? 'text' : 'password'} autocomplete="off" bind:value={confirmPassword} required />
            {/snippet}
          </FormField>
          <Button variant="ghost" size="sm" onclick={() => (showPassword = !showPassword)} aria-pressed={showPassword}>{showPassword ? 'Hide password' : 'Show password'}</Button>
          {#if message}<p role="alert" class="text-sm text-destructive">{message}</p>{/if}
          <Button type="submit" loading={busy} loadingLabel="Updating password" disabled={busy}>Save new password</Button>
        </form>
      {:else}
        <form class="grid gap-4" onsubmit={(event) => { event.preventDefault(); void request(); }}>
          <FormField label="Email" required error={issues.email} description="Use an address at example.com.">
            {#snippet children(control)}
              <Input {...control.props} type="email" autocomplete="email" bind:value={email} required />
            {/snippet}
          </FormField>
          {#if message}<p role="alert" class="text-sm text-destructive">{message}</p>{/if}
          <Button type="submit" loading={busy} loadingLabel="Sending request" disabled={busy}>Send reset link</Button>
        </form>
      {/if}
    </CardContent>
    <CardFooter><Button href={routeHref(config.signInPath)} variant="ghost">Back to sign in</Button></CardFooter>
  </Card>
  <p class="mt-4 text-center text-xs text-muted-foreground" data-testid="simulated-password-notice">Simulation only — do not use a real password. What you type is kept as plain text in this browser and in exported snapshots.</p>
</main>
