<script lang="ts">
import { navigate, nextPath, runService } from '@protoyard/renderer-svelte';
import { createMfaServices } from '@protoyard/saas';
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
import SsoButtons from '../../components/SsoButtons.svelte';
import { applyServiceError, authServices, routeHref } from './helpers.ts';

const { runtime, config } = authServices();
const mfa = createMfaServices(runtime);
let email = $state('');
let password = $state('');
let showPassword = $state(false);
let busy = $state(false);
let issues = $state<Record<string, string>>({});
let message = $state('');

async function submit() {
  busy = true;
  issues = {};
  message = '';
  const result = await runService(() => mfa.signInWithPassword({ email, password }));
  busy = false;
  if (!result.ok) {
    applyServiceError(
      result.error,
      (next) => (issues = next),
      (next) => (message = next)
    );
    return;
  }
  const next = nextPath(new URLSearchParams(location.hash.split('?')[1] ?? ''), config.homePath);
  if (result.value.status === 'mfa-required') {
    navigate(
      `/auth/mfa?account=${encodeURIComponent(result.value.account.id)}&next=${encodeURIComponent(next)}`
    );
    return;
  }
  navigate(next);
}
</script>

<main class="mx-auto grid min-h-app w-full max-w-md content-center p-4 sm:p-8" data-testid="auth-sign-in">
  <Card>
    <CardHeader>
      <CardTitle>Sign in</CardTitle>
      <CardDescription>Email and password for this simulated prototype account.</CardDescription>
    </CardHeader>
    <CardContent>
      <form class="grid gap-4" onsubmit={(event) => { event.preventDefault(); void submit(); }}>
        <FormField label="Email" required error={issues.email}>
          {#snippet children(control)}
            <Input {...control.props} type="email" autocomplete="email" bind:value={email} required />
          {/snippet}
        </FormField>
        <FormField label="Password" required error={issues.password}>
          {#snippet children(control)}
            <Input {...control.props} type={showPassword ? 'text' : 'password'} autocomplete="current-password" bind:value={password} required />
          {/snippet}
        </FormField>
        <Button variant="ghost" size="sm" onclick={() => (showPassword = !showPassword)} aria-pressed={showPassword}>
          {showPassword ? 'Hide password' : 'Show password'}
        </Button>
        {#if message}<p role="alert" class="text-sm text-destructive">{message}</p>{/if}
        <Button type="submit" loading={busy} loadingLabel="Signing in" disabled={busy}>Sign in</Button>
      </form>
      {#if config.ssoProviders.length > 0}
        <div class="mt-6 grid gap-3" data-testid="auth-sso">
          <p class="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true"><span class="h-px flex-1 bg-border"></span>or<span class="h-px flex-1 bg-border"></span></p>
          <SsoButtons providers={config.ssoProviders} intent="sign-in" />
        </div>
      {/if}
    </CardContent>
    <CardFooter class="flex flex-wrap justify-between gap-2">
      <Button href={routeHref(config.signUpPath)} variant="ghost">Create account</Button>
      <Button href="#/auth/magic" variant="outline">Use a magic link</Button>
    </CardFooter>
    <CardFooter>
      <Button href="#/auth/reset" variant="link">Forgot password?</Button>
    </CardFooter>
  </Card>
  <p class="mt-4 text-center text-xs text-muted-foreground">Simulation only — never enter a real password.</p>
</main>
